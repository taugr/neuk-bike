import { beforeEach, expect, it, vi } from 'vitest';
beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});
it('shares a request allowance between consumers even when storage is unavailable', async () => {
  const { reserveWeatherRequest } = await import('./weather-request-budget');
  expect(reserveWeatherRequest(100000)).toBe(0);
  expect(reserveWeatherRequest(100001)).toBe(9999);
  expect(reserveWeatherRequest(110000)).toBe(0);
});
it('honours a provider retry deadline for all consumers', async () => {
  const { reserveWeatherRequest, deferWeatherRequests } =
    await import('./weather-request-budget');
  deferWeatherRequests('120', 60000, 100000);
  expect(reserveWeatherRequest(100000)).toBe(120000);
  expect(reserveWeatherRequest(220000)).toBe(0);
});
it('retains the shared budget across module reloads', async () => {
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
  const first = await import('./weather-request-budget');
  expect(first.reserveWeatherRequest(100000)).toBe(0);
  vi.resetModules();
  const second = await import('./weather-request-budget');
  expect(second.reserveWeatherRequest(100001)).toBe(9999);
});
