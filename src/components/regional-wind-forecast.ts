'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  parseRegionalWind,
  reserveWindRequest,
  type WindRegion,
} from '@/lib/regional-wind';
import { PROVIDER_MAX_AGE, PROVIDER_REFRESH } from '@/lib/provider-wind';
import { windStatus } from '@/lib/wind';
import { windAvailability, type WindLoadStatus } from '@/lib/wind-availability';

type Entry = { key: string; hour: number; value: unknown; capturedAt: number };
const cacheKey = 'neuk-regional-wind-v1';
const budgetKey = 'neuk-wind-budget-v1';
const retryKey = 'neuk-wind-retry-after-v1';
let memoryCache: Entry[] = [];
let requestHistory: number[] = [];
let retryAfter = 0;
function readCache() {
  try {
    const parsed: unknown = JSON.parse(
      sessionStorage.getItem(cacheKey) || '[]',
    );
    if (Array.isArray(parsed))
      memoryCache = parsed
        .filter(
          (e) =>
            typeof e?.key === 'string' &&
            Number.isFinite(e?.capturedAt) &&
            Number.isFinite(e?.hour),
        )
        .slice(-12);
  } catch {
    /* The in-memory cache still works with storage blocked. */
  }
  return memoryCache;
}
function storeEntry(entry: Entry) {
  memoryCache = [
    ...memoryCache.filter((e) => e.key !== entry.key || e.hour !== entry.hour),
    entry,
  ].slice(-12);
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(memoryCache));
  } catch {
    /* Optional cache. */
  }
}
export function useRegionalWindForecast(
  enabled: boolean,
  region: WindRegion | null,
) {
  const [snapshot, setSnapshot] = useState<
    (Entry & { cached: boolean }) | null
  >(null);
  const [state, setState] = useState<{
    key: string | null;
    status: WindLoadStatus;
  }>({ key: null, status: 'idle' });
  const [now, setNow] = useState(Date.now);
  const key = region?.key ?? null;
  useEffect(() => {
    if (!enabled && !snapshot) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [enabled, snapshot]);
  useEffect(() => {
    if (!enabled || !region) return;
    let stopped = false,
      loading = false;
    let controller: AbortController | null = null;
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    const currentRegion = region;
    const load = async () => {
      if (stopped || loading) return;
      const stamp = Date.now();
      setNow(stamp);
      const cached = [...readCache()]
        .reverse()
        .find(
          (e) =>
            e.key === currentRegion.key &&
            stamp - e.capturedAt >= 0 &&
            stamp - e.capturedAt <= PROVIDER_MAX_AGE &&
            parseRegionalWind(e.value, currentRegion, e.capturedAt, stamp),
        );
      if (cached && stamp - cached.capturedAt < PROVIDER_REFRESH) {
        setSnapshot({ ...cached, cached: false });
        setState({ key: currentRegion.key, status: 'loaded' });
        return;
      }
      try {
        const stored: unknown = JSON.parse(
          sessionStorage.getItem(budgetKey) || 'null',
        );
        if (Array.isArray(stored))
          requestHistory = stored.filter(
            (t) => typeof t === 'number' && Number.isFinite(t),
          );
      } catch {
        /* Use the in-memory limit. */
      }
      try {
        const savedRetry = Number(sessionStorage.getItem(retryKey));
        if (Number.isFinite(savedRetry))
          retryAfter = Math.max(retryAfter, savedRetry);
      } catch {
        /* Keep the in-memory retry deadline. */
      }
      const budget = reserveWindRequest(requestHistory, stamp);
      const wait = Math.max(budget.wait, retryAfter - stamp);
      if (wait > 0) {
        if (cached) {
          setSnapshot({ ...cached, cached: true });
          setState({ key: currentRegion.key, status: 'loaded' });
        } else
          setState({
            key: currentRegion.key,
            status: wait >= 60000 ? 'error' : 'loading',
          });
        clearTimeout(scheduled);
        scheduled = setTimeout(() => void load(), wait + 10);
        return;
      }
      requestHistory = budget.history;
      try {
        sessionStorage.setItem(budgetKey, JSON.stringify(requestHistory));
      } catch {
        /* In-memory limit remains. */
      }
      loading = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      setState({ key: currentRegion.key, status: 'loading' });
      try {
        const response = await fetch(currentRegion.url, {
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        });
        if (response.status === 429) {
          const header = response.headers.get('retry-after');
          const delay =
            header && /^\d+$/.test(header)
              ? Number(header) * 1000
              : header
                ? Date.parse(header) - Date.now()
                : 0;
          retryAfter =
            Date.now() +
            Math.max(PROVIDER_REFRESH, Number.isFinite(delay) ? delay : 0);
          try {
            sessionStorage.setItem(retryKey, String(retryAfter));
          } catch {
            /* In-memory retry remains. */
          }
        }
        if (!response.ok) throw new Error('Forecast unavailable');
        const value: unknown = await response.json(),
          capturedAt = Date.now();
        if (!parseRegionalWind(value, currentRegion, capturedAt))
          throw new Error('Invalid regional forecast');
        if (stopped) return;
        const entry = {
          key: currentRegion.key,
          hour: Math.floor(capturedAt / 3600000),
          value,
          capturedAt,
        };
        storeEntry(entry);
        setSnapshot({ ...entry, cached: false });
        setNow(capturedAt);
        setState({ key: currentRegion.key, status: 'loaded' });
      } catch {
        if (stopped) return;
        if (cached) {
          setSnapshot({ ...cached, cached: true });
          setState({ key: currentRegion.key, status: 'loaded' });
        } else {
          setSnapshot(null);
          setState({ key: currentRegion.key, status: 'error' });
        }
      } finally {
        clearTimeout(timeout);
        loading = false;
      }
    };
    setState({ key: currentRegion.key, status: 'loading' });
    scheduled = setTimeout(() => void load(), 800);
    const refresh = window.setInterval(() => void load(), PROVIDER_REFRESH);
    const resume = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      stopped = true;
      clearTimeout(scheduled);
      clearInterval(refresh);
      controller?.abort();
      document.removeEventListener('visibilitychange', resume);
    };
    // The key fully identifies the quantized request, independently of pan object identity.
  }, [enabled, key]);
  const hour = Math.floor(now / 3600000);
  const wind = useMemo(
    () =>
      snapshot && region && snapshot.key === key
        ? parseRegionalWind(
            snapshot.value,
            region,
            snapshot.capturedAt,
            hour * 3600000,
          )
        : null,
    [snapshot, key, hour],
  );
  const freshness = windStatus(wind, now);
  const status: WindLoadStatus = !region
    ? enabled
      ? 'error'
      : 'idle'
    : state.key !== key
      ? enabled
        ? 'loading'
        : 'idle'
      : !enabled && state.status === 'loading'
        ? wind
          ? 'loaded'
          : 'idle'
        : state.status;
  return {
    wind,
    status,
    availability: windAvailability(status, freshness),
    freshness,
    provider: snapshot?.cached ? ('cached' as const) : ('grid' as const),
  };
}
