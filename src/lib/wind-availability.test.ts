import { expect, it } from 'vitest';
import { windAvailability } from './wind-availability';

it('distinguishes a never-requested forecast from a genuine failure', () => {
  expect(windAvailability('idle', 'missing')).toBe('idle');
  expect(windAvailability('loading', 'missing')).toBe('loading');
  expect(windAvailability('error', 'missing')).toBe('error');
});
it('reports current forecasts as available', () => {
  expect(windAvailability('loaded', 'fresh')).toBe('available');
});
it('reports expiry or a missing current hour as stale after a successful load', () => {
  expect(windAvailability('loaded', 'stale')).toBe('stale');
  expect(windAvailability('loaded', 'missing')).toBe('stale');
});
it('reports active refresh and failed refresh distinctly from saved data', () => {
  expect(windAvailability('loading', 'fresh')).toBe('loading');
  expect(windAvailability('loading', 'stale')).toBe('loading');
  expect(windAvailability('error', 'stale')).toBe('error');
});
