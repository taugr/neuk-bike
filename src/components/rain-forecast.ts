'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  rainFresh,
  rainRegion,
  parseRain,
  RAIN_REFRESH,
  type RainSnapshot,
} from '@/lib/rain';
import {
  reserveWeatherRequest,
  deferWeatherRequests,
} from '@/lib/weather-request-budget';
import type { ParkingMapBounds } from '@/lib/map-pins';
const cache = new Map<string, RainSnapshot>();
type State = 'loading' | 'ready' | 'error' | 'offline' | 'zoom';
export function useRainForecast(
  enabled: boolean,
  bounds: ParkingMapBounds | null,
) {
  const region = useMemo(() => (bounds ? rainRegion(bounds) : null), [bounds]);
  const key = region?.key;
  const [snapshot, setSnapshot] = useState<RainSnapshot | null>(null);
  const [state, setState] = useState<State>('loading');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    if (!region) {
      setSnapshot(null);
      setState(bounds ? 'zoom' : 'loading');
      return;
    }
    let stopped = false,
      loading = false;
    let controller: AbortController | undefined;
    let scheduled: ReturnType<typeof setTimeout>;
    const load = async () => {
      if (stopped || loading || document.hidden) return;
      const stamp = Date.now();
      setNow(stamp);
      if (!navigator.onLine) {
        setState('offline');
        setSnapshot(null);
        return;
      }
      const cached = cache.get(region.key);
      if (cached && rainFresh(cached, stamp)) {
        setSnapshot(cached);
        setState('ready');
        if (stamp - cached.fetchedAt < RAIN_REFRESH) return;
      }
      const wait = reserveWeatherRequest(stamp);
      if (wait > 0) {
        clearTimeout(scheduled);
        scheduled = setTimeout(() => void load(), wait + 10);
        if (!cached || !rainFresh(cached, stamp))
          setState(wait >= 60000 ? 'error' : 'loading');
        return;
      }
      loading = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      try {
        const response = await fetch(region.url, {
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        });
        if (response.status === 429)
          deferWeatherRequests(
            response.headers.get('retry-after'),
            RAIN_REFRESH,
          );
        if (!response.ok) throw new Error('Rain unavailable');
        const next = parseRain(await response.json(), region);
        if (!next) throw new Error('Invalid rain response');
        if (stopped) return;
        if (cache.size >= 12) cache.delete(cache.keys().next().value!);
        cache.set(region.key, next);
        setSnapshot(next);
        setNow(Date.now());
        setState('ready');
      } catch {
        if (!stopped) {
          if (!navigator.onLine) {
            setSnapshot(null);
            setState('offline');
          } else if (cached && rainFresh(cached)) {
            setSnapshot(cached);
            setState('ready');
          } else {
            setSnapshot(null);
            setState(navigator.onLine ? 'error' : 'offline');
          }
        }
      } finally {
        clearTimeout(timeout);
        loading = false;
      }
    };
    setSnapshot(null);
    setState('loading');
    scheduled = setTimeout(() => void load(), 650);
    const tick = () => {
      setNow(Date.now());
      if (!navigator.onLine) {
        controller?.abort();
        setState('offline');
        setSnapshot(null);
      } else void load();
    };
    const timer = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    window.addEventListener('offline', tick);
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(scheduled);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
      window.removeEventListener('offline', tick);
    };
  }, [enabled, key, !!bounds]);
  const rain =
    enabled &&
    snapshot !== null &&
    snapshot.key === key &&
    rainFresh(snapshot, now) &&
    state !== 'offline'
      ? snapshot
      : null;
  const status = !enabled
    ? 'idle'
    : !region
      ? bounds
        ? 'zoom'
        : 'loading'
      : snapshot && !rainFresh(snapshot, now)
        ? 'stale'
        : state;
  return { rain, status };
}
