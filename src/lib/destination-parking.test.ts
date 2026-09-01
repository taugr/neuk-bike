import { describe, expect, it } from 'vitest';
import type { CycleRouteWaypoint } from '@/lib/cyclestreets';
import {
  getDestinationParkingShortlist,
  hasRestrictedParkingAccess,
  rankDestinationParkingCandidates,
  replaceRouteFinishWithParking,
  type DestinationParkingCandidate,
} from '@/lib/destination-parking';
import { createRouteDraft } from '@/lib/route-draft';
import type { ParkingPoint } from '@/lib/types';

const destination: CycleRouteWaypoint = {
  id: 'destination',
  label: 'Museum',
  latitude: 55.947,
  longitude: -3.19,
  source: 'search',
};

function point(
  id: string,
  latitude: number,
  properties: ParkingPoint['properties'] = {},
): ParkingPoint {
  return {
    id,
    name: id,
    latitude,
    longitude: destination.longitude,
    properties,
    sourceId: 'test',
  };
}

describe('destination parking', () => {
  it('prefers the primary radius when it contains at least three neuks', () => {
    const result = getDestinationParkingShortlist(
      [
        point('near-1', 55.9475),
        point('near-2', 55.948),
        point('near-3', 55.9485),
        point('outer', 55.957),
      ],
      destination,
    );

    expect(result.map(({ id }) => id)).toEqual(['near-1', 'near-2', 'near-3']);
  });

  it('expands to 1.5 km when fewer than three primary candidates exist', () => {
    const result = getDestinationParkingShortlist(
      [
        point('near', 55.9475),
        point('outer-1', 55.955),
        point('outer-2', 55.957),
        point('too-far', 55.97),
      ],
      destination,
    );

    expect(result.map(({ id }) => id)).toEqual(['near', 'outer-1', 'outer-2']);
  });

  it('ranks by route delta, then metadata, then destination distance', () => {
    const candidates: DestinationParkingCandidate[] = [
      {
        point: point('unknown', 55.9475),
        destinationDistanceMeters: 50,
        route: null,
        routeDurationDeltaSeconds: null,
      },
      {
        point: point('covered', 55.948, {
          access: 'yes',
          capacity: 12,
          covered: 'yes',
        }),
        destinationDistanceMeters: 100,
        route: null,
        routeDurationDeltaSeconds: null,
      },
      {
        point: point('best-route', 55.949),
        destinationDistanceMeters: 200,
        route: null,
        routeDurationDeltaSeconds: 30,
      },
    ];

    expect(
      rankDestinationParkingCandidates(candidates).map(({ point }) => point.id),
    ).toEqual(['best-route', 'covered', 'unknown']);
  });

  it('does not recommend parking with explicitly restricted access', () => {
    const restricted = point('restricted', 55.9475, {
      access: 'customers',
      capacity: 48,
    });
    const unknown = point('unknown', 55.948, {
      access: ' ',
      capacity: 10,
    });
    const publicParking = point('public', 55.949, {
      access: 'yes',
      capacity: 8,
    });
    const candidates: DestinationParkingCandidate[] = [
      {
        point: restricted,
        destinationDistanceMeters: 50,
        route: null,
        routeDurationDeltaSeconds: -300,
      },
      {
        point: unknown,
        destinationDistanceMeters: 100,
        route: null,
        routeDurationDeltaSeconds: -240,
      },
      {
        point: publicParking,
        destinationDistanceMeters: 150,
        route: null,
        routeDurationDeltaSeconds: -180,
      },
    ];

    expect(hasRestrictedParkingAccess(restricted)).toBe(true);
    expect(hasRestrictedParkingAccess(unknown)).toBe(false);
    expect(hasRestrictedParkingAccess(publicParking)).toBe(false);
    expect(
      rankDestinationParkingCandidates(candidates).map(({ point }) => point.id),
    ).toEqual(['unknown', 'public']);
  });

  it('replaces only the final route waypoint', () => {
    const start: CycleRouteWaypoint = {
      id: 'start',
      label: 'Home',
      latitude: 55.95,
      longitude: -3.2,
      source: 'map',
    };
    const draft = {
      ...createRouteDraft('draft', start),
      waypoints: [start, destination],
    };
    const parking = point('parking', 55.9475);

    const result = replaceRouteFinishWithParking(draft, parking);

    expect(result.waypoints[0]).toBe(start);
    expect(result.waypoints[1]).toMatchObject({
      id: 'parking',
      label: 'parking',
      source: 'parking',
    });
    expect(draft.waypoints.at(-1)).toBe(destination);
  });
});
