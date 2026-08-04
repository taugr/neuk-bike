import { describe, expect, it } from 'vitest';
import { routeNameToGpxFilename, serializeRouteToGpx } from '@/lib/gpx';
import type { CycleRoute, CycleRouteWaypoint } from '@/lib/cyclestreets';

const route: CycleRoute = {
  plan: 'balanced',
  distanceMeters: 1200,
  durationSeconds: 420,
  points: [
    [55.95, -3.2],
    [55.96, -3.18],
  ],
  instructions: [],
  source: 'cyclestreets',
};
const waypoints: CycleRouteWaypoint[] = [
  {
    id: 'start',
    label: 'Canal & Castle',
    latitude: 55.95,
    longitude: -3.2,
    source: 'search',
  },
  {
    id: 'finish',
    label: 'Portobello <Beach>',
    latitude: 55.96,
    longitude: -3.18,
    source: 'search',
  },
];

describe('GPX export', () => {
  it('serializes named stops and route points in latitude/longitude order', () => {
    const xml = serializeRouteToGpx({
      exportedAt: new Date('2026-07-29T12:00:00.000Z'),
      name: 'Canal & Coast',
      route,
      waypoints,
    });

    expect(xml).toContain('<name>Canal &amp; Coast</name>');
    expect(xml).toContain(
      '<wpt lat="55.95" lon="-3.2"><name>Canal &amp; Castle</name></wpt>',
    );
    expect(xml).toContain(
      '<wpt lat="55.96" lon="-3.18"><name>Portobello &lt;Beach&gt;</name></wpt>',
    );
    expect(xml).toContain('<trkpt lat="55.95" lon="-3.2"></trkpt>');
    expect(xml).toContain('<time>2026-07-29T12:00:00.000Z</time>');
  });

  it('creates safe human-readable filenames', () => {
    expect(routeNameToGpxFilename('Canal to Portobello')).toBe(
      'canal-to-portobello.gpx',
    );
    expect(routeNameToGpxFilename('')).toBe('neuk-route.gpx');
  });

  it('rejects an empty route', () => {
    expect(() =>
      serializeRouteToGpx({
        name: 'Empty',
        route: { ...route, points: [] },
        waypoints,
      }),
    ).toThrow('at least two route points');
  });
});
