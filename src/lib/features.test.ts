import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.each([
  [undefined, true],
  ['true', true],
  ['false', false],
  ['', false],
  ['invalid', false],
] as const)(
  'wind build setting %s enables the feature: %s',
  async (setting, expected) => {
    vi.stubEnv('NEXT_PUBLIC_WIND_ENABLED', setting);
    vi.resetModules();
    expect((await import('./features')).WIND_ENABLED).toBe(expected);
  },
);
