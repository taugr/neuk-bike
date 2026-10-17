'use client';
import { useRegionalWindForecast } from './regional-wind-forecast';
import type { WindRegion } from '@/lib/regional-wind';
import { windAvailability } from '@/lib/wind-availability';
import { WIND_ENABLED } from '@/lib/features';

import {
  parseProviderWind,
  PROVIDER_GRID_URL,
  PROVIDER_MAX_AGE,
  PROVIDER_REFRESH,
} from '@/lib/provider-wind';
import { useEffect, useMemo, useState } from 'react';
import { EDINBURGH_WIND_URL, parseOpenMeteoWind, windStatus } from '@/lib/wind';

export function useWindForecast(enabled: boolean, region?: WindRegion | null) {
  const permitted = WIND_ENABLED;
  const regional = region !== undefined && permitted;
  const regionalForecast = useRegionalWindForecast(
    enabled && regional,
    region ?? null,
  );
  const legacyEnabled = enabled && permitted && !regional;
  const [snapshot, setSnapshot] = useState<{
    value: unknown;
    capturedAt: number;
    provider?: 'grid' | 'fallback' | 'cached';
  } | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>(
    'idle',
  );
  const [now, setNow] = useState(Date.now);
  const hasSnapshot = snapshot !== null;
  // Keep a retained forecast's age accurate while the layer is off and after sleep.
  useEffect(() => {
    if (!enabled && !hasSnapshot) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [enabled, hasSnapshot]);
  useEffect(() => {
    if (!legacyEnabled) return;
    let controller: AbortController;
    let stopped = false;
    let loading = false;
    let lastAttempt = 0;
    const load = async () => {
      if (loading) return;
      loading = true;
      lastAttempt = Date.now();
      controller = new AbortController();
      const requestController = controller;
      const timeout = window.setTimeout(() => requestController.abort(), 10000);
      setNow(Date.now());
      setStatus('loading');
      try {
        const request = async (url: string) => {
          const response = await fetch(url, {
            signal: controller.signal,
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
          });
          if (!response.ok) throw new Error('Wind unavailable');
          return response.json() as Promise<unknown>;
        };
        let provider: 'grid' | 'fallback' | 'cached' | undefined;
        let providerValue: unknown;
        let capturedAt = Date.now();
        let cached: { value: unknown; capturedAt: number } | null = null;
        try {
          cached = JSON.parse(
            sessionStorage.getItem('neuk-ukv-grid-v1') || 'null',
          );
        } catch {
          /* Storage can be unavailable. */
        }
        if (
          cached &&
          (!Number.isFinite(cached.capturedAt) ||
            capturedAt - cached.capturedAt < 0 ||
            capturedAt - cached.capturedAt > PROVIDER_MAX_AGE ||
            !parseProviderWind(cached.value, cached.capturedAt, capturedAt))
        )
          cached = null;
        if (cached && capturedAt - cached.capturedAt < PROVIDER_REFRESH) {
          providerValue = cached.value;
          capturedAt = cached.capturedAt;
          provider = 'grid';
        } else {
          try {
            providerValue = await request(PROVIDER_GRID_URL);
            capturedAt = Date.now();
            if (!parseProviderWind(providerValue, capturedAt))
              throw new Error('Invalid grid');
            provider = 'grid';
            try {
              sessionStorage.setItem(
                'neuk-ukv-grid-v1',
                JSON.stringify({ value: providerValue, capturedAt }),
              );
            } catch {
              /* Optional cache. */
            }
          } catch {
            try {
              providerValue = await request(EDINBURGH_WIND_URL);
              capturedAt = Date.now();
              if (!parseOpenMeteoWind(providerValue, capturedAt))
                throw new Error('Invalid baseline');
              provider = 'fallback';
            } catch {
              if (!cached) throw new Error('Wind unavailable');
              providerValue = cached.value;
              capturedAt = cached.capturedAt;
              provider = 'cached';
            }
          }
        }
        const value: unknown = providerValue;
        const parsed =
          provider === 'grid' || provider === 'cached'
            ? parseProviderWind(value, capturedAt)
            : parseOpenMeteoWind(value, capturedAt);
        if (!parsed) throw new Error('Invalid forecast');
        if (stopped) return;
        setSnapshot({
          value,
          capturedAt,
          provider,
        });
        setNow(Date.now());
        setStatus('loaded');
      } catch {
        if (!stopped) {
          setSnapshot(null);
          setStatus('error');
        }
      } finally {
        loading = false;
        window.clearTimeout(timeout);
      }
    };
    setStatus('loading');
    const initialLoad = window.setTimeout(() => void load(), 800);
    const refresh = window.setInterval(() => void load(), PROVIDER_REFRESH);
    const resume = () => {
      if (document.visibilityState !== 'visible') return;
      setNow(Date.now());
      if (Date.now() - lastAttempt >= PROVIDER_REFRESH) void load();
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      stopped = true;
      window.clearTimeout(initialLoad);
      controller?.abort();
      if (refresh) window.clearInterval(refresh);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [legacyEnabled]);
  // Select the actual forecast hour as time advances, including after sleep.
  const hour = Math.floor(now / 3600000);
  const providerExpired =
    !!snapshot?.provider && now - snapshot.capturedAt > PROVIDER_MAX_AGE;
  const wind = useMemo(
    () =>
      snapshot
        ? snapshot.provider === 'grid' || snapshot.provider === 'cached'
          ? parseProviderWind(
              snapshot.value,
              snapshot.capturedAt,
              hour * 3600000,
            )
          : parseOpenMeteoWind(
              snapshot.value,
              snapshot.capturedAt,
              hour * 3600000,
            )
        : null,
    [snapshot, hour, providerExpired],
  );
  // Turning a layer off cancels its request; cancellation is neither loading nor failure.
  const loadStatus =
    status === 'loading' && !enabled ? (snapshot ? 'loaded' : 'idle') : status;
  const freshness = windStatus(wind, now);
  if (regional) return regionalForecast;
  if (!permitted)
    return {
      wind: null,
      status: 'idle' as const,
      availability: 'idle' as const,
      freshness: 'missing' as const,
      provider: undefined,
    };
  return {
    wind,
    status: loadStatus,
    availability: windAvailability(loadStatus, freshness),
    freshness,
    provider: snapshot?.provider,
  };
}
