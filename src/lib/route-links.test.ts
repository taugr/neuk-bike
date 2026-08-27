import { describe, expect, it } from 'vitest';
import {
  buildRouteShareUrl,
  parseRouteShareHash,
  serializeRouteShareHash,
} from '@/lib/route-links';

const waypoints = [
  { latitude: 55.95325, longitude: -3.18827 },
  { latitude: 55.94271, longitude: -3.28591 },
];

describe('route links', () => {
  it('round-trips route preference and compact coordinates', () => {
    const hash = serializeRouteShareHash('quietest', waypoints);

    expect(hash).toMatch(/^#route=1q~/);
    expect(parseRouteShareHash(hash)).toEqual({
      plan: 'quietest',
      waypoints,
    });
  });

  it('builds a base-path-safe URL without route names or geometry', () => {
    expect(
      buildRouteShareUrl(
        'https://example.com',
        '/neuk-bike/parking/cec-1/',
        'balanced',
        waypoints,
      ),
    ).toMatch(/^https:\/\/example\.com\/neuk-bike\/#route=1b~/);
  });

  it('rejects malformed or unsafe route hashes', () => {
    expect(parseRouteShareHash('#route=2b~abc.def~ghi.jkl')).toBeNull();
    expect(parseRouteShareHash('#route=1b~abc.def')).toBeNull();
    expect(parseRouteShareHash('#route=1b~zzzzzz.0~0.0')).toBeNull();
  });
});
