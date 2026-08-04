import { describe, expect, it } from 'vitest';
import {
  createSavedRouteRecord,
  groupRouteWaypointNumbersByInstruction,
  isSavedRouteRecord,
  savedRouteToCycleRoute,
} from '@/lib/saved-routes';
import type { CycleRoute, CycleRouteWaypoint } from '@/lib/cyclestreets';

const waypoints: CycleRouteWaypoint[] = [
  {
    id: 'start',
    label: 'Start',
    latitude: 55.95,
    longitude: -3.2,
    source: 'current-location',
  },
  {
    id: 'finish',
    label: 'Finish',
    latitude: 55.96,
    longitude: -3.18,
    source: 'search',
  },
];
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
  itineraryId: '123',
  routeUrl: 'https://www.cyclestreets.net/journey/123/',
};

describe('saved routes', () => {
  it('creates a versioned record and restores a CycleRoute', () => {
    const record = createSavedRouteRecord({
      id: 'route-1',
      name: ' Canal to Coast ',
      route,
      waypoints,
      createdAt: '2026-07-29T12:00:00.000Z',
    });

    expect(record.name).toBe('Canal to Coast');
    expect(isSavedRouteRecord(record)).toBe(true);
    expect(savedRouteToCycleRoute(record)).toEqual(route);
  });

  it('rejects malformed coordinates and route geometry', () => {
    const record = createSavedRouteRecord({
      id: 'route-1',
      name: 'Route',
      route,
      waypoints,
    });

    expect(isSavedRouteRecord({ ...record, name: '' })).toBe(false);
    expect(
      isSavedRouteRecord({
        ...record,
        waypoints: [{ ...waypoints[0], latitude: 120 }, waypoints[1]],
      }),
    ).toBe(false);
    expect(isSavedRouteRecord({ ...record, points: [[55.95]] })).toBe(false);
  });

  it('matches numbered waypoints to ordered route instructions', () => {
    const via = {
      id: 'via',
      label: 'Canal',
      latitude: 55.955,
      longitude: -3.19,
      source: 'map' as const,
    };
    const instructions = [
      {
        id: 'start',
        anchor: [55.95, -3.2] as [number, number],
        streetName: 'Start Street',
        turn: 'start',
        distanceMeters: 200,
        durationSeconds: 60,
        travelMode: 'cycling',
      },
      {
        id: 'before-via',
        anchor: [55.953, -3.195] as [number, number],
        streetName: 'Approach Road',
        turn: 'straight',
        distanceMeters: 200,
        durationSeconds: 60,
        travelMode: 'cycling',
      },
      {
        id: 'via',
        anchor: [55.9551, -3.1901] as [number, number],
        streetName: 'Canal Road',
        turn: 'turn left',
        distanceMeters: 200,
        durationSeconds: 60,
        travelMode: 'cycling',
      },
      {
        id: 'arrival',
        anchor: [55.96, -3.18] as [number, number],
        streetName: 'Finish',
        turn: 'arrive',
        distanceMeters: 0,
        durationSeconds: 0,
        travelMode: 'cycling',
      },
    ];

    expect(
      groupRouteWaypointNumbersByInstruction(
        [waypoints[0]!, via, waypoints[1]!],
        instructions,
      ),
    ).toEqual([[1], [], [2], [3]]);
  });
});
