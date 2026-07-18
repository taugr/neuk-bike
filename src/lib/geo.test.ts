import { describe, expect, it } from 'vitest';
import {
  distanceMeters,
  formatDistance,
  isFarFromNearestParking,
  isResolvedLocation,
  sortByDistance,
} from '@/lib/geo';
import { parsePlaceSearchResults } from '@/lib/geocoder';
import {
  describeParkingPoint,
  getParkingEssentialDetails,
  getParkingDetails,
  getParkingPopupDetails,
} from '@/lib/parking';
import {
  buildParkingShareUrl,
  parseShareLinkState,
  parseUrlLocation,
  parseUrlParkingId,
} from '@/lib/share-links';
import type { ParkingPoint } from '@/lib/types';

const points: ParkingPoint[] = [
  {
    id: 'far',
    name: 'Far point',
    latitude: 55.9605,
    longitude: -3.21,
    properties: {},
    sourceId: 'test',
  },
  {
    id: 'near',
    name: 'Near point',
    latitude: 55.9534,
    longitude: -3.1884,
    properties: {},
    sourceId: 'test',
  },
];

function parkingPoint(
  properties: ParkingPoint['properties'],
  distanceMeters?: number,
): ParkingPoint {
  return {
    id: 'popup',
    name: 'Popup point',
    latitude: 55.9533,
    longitude: -3.1883,
    distanceMeters,
    properties,
    sourceId: 'test',
  };
}

describe('geo utilities', () => {
  it('calculates approximate distance in metres', () => {
    const distance = distanceMeters(
      { latitude: 55.9533, longitude: -3.1883 },
      { latitude: 55.9534, longitude: -3.1884 },
    );

    expect(distance).toBeGreaterThan(10);
    expect(distance).toBeLessThan(15);
  });

  it('sorts points by nearest distance', () => {
    const sorted = sortByDistance(points, {
      latitude: 55.9533,
      longitude: -3.1883,
    });

    expect(sorted.map((point) => point.id)).toEqual(['near', 'far']);
    expect(sorted[0]?.distanceMeters).toBeLessThan(
      sorted[1]?.distanceMeters ?? 0,
    );
    expect(
      sorted.every((point) => typeof point.distanceMeters === 'number'),
    ).toBe(true);
  });

  it('handles empty point lists', () => {
    expect(
      sortByDistance([], { latitude: 55.9533, longitude: -3.1883 }),
    ).toEqual([]);
  });

  it('detects locations far from Edinburgh cycle parking', () => {
    expect(
      isFarFromNearestParking(points, {
        latitude: 51.5072,
        longitude: -0.1276,
      }),
    ).toBe(true);
    expect(
      isFarFromNearestParking(points, {
        latitude: 55.9533,
        longitude: -3.1883,
      }),
    ).toBe(false);
  });

  it('rejects unresolved null-island coordinates', () => {
    expect(isResolvedLocation({ latitude: 0, longitude: 0 })).toBe(false);
    expect(isResolvedLocation({ latitude: 0.00001, longitude: -0.00001 })).toBe(
      false,
    );
    expect(isResolvedLocation({ latitude: 55.9533, longitude: -3.1883 })).toBe(
      true,
    );
  });

  it('rejects out-of-range coordinates', () => {
    expect(isResolvedLocation({ latitude: 91, longitude: -3.1883 })).toBe(
      false,
    );
    expect(isResolvedLocation({ latitude: 55.9533, longitude: -181 })).toBe(
      false,
    );
  });

  it('formats metres and kilometres', () => {
    expect(formatDistance(42.4)).toBe('42 m');
    expect(formatDistance(1_250)).toBe('1.3 km');
  });

  it('formats parking details with not-listed values', () => {
    const [distance, spaces, type, cover, access] = getParkingDetails({
      id: 'details',
      name: 'Details point',
      latitude: 55.9533,
      longitude: -3.1883,
      distanceMeters: 42,
      properties: {
        capacity: 0,
        bicycle_pa: ' ',
        covered: ' ',
        access: null,
      },
      sourceId: 'test',
    });

    expect(distance?.value).toBe('42 m away');
    expect(spaces?.value).toBe('Not listed');
    expect(type?.value).toBe('Not listed');
    expect(cover?.value).toBe('Not listed');
    expect(access?.value).toBe('Not listed');
  });

  it('formats popup distance metric and space detail tones', () => {
    const near = getParkingPopupDetails(parkingPoint({ capacity: 4 }, 249));
    expect(near.metrics).toEqual([
      {
        icon: 'distance',
        kind: 'distance',
        label: 'Distance',
        tone: 'green',
        value: '249 m away',
      },
    ]);
    expect(near.details[0]).toEqual({
      emphasis: '4',
      icon: 'parking',
      kind: 'spaces',
      label: 'Spaces',
      tone: 'amber',
      value: 'Spaces',
    });

    const medium = getParkingPopupDetails(parkingPoint({ capacity: 10 }, 250));
    expect(medium.metrics).toEqual([
      {
        icon: 'distance',
        kind: 'distance',
        label: 'Distance',
        tone: 'amber',
        value: '250 m away',
      },
    ]);
    expect(medium.details[0]).toEqual({
      emphasis: '10',
      icon: 'parking',
      kind: 'spaces',
      label: 'Spaces',
      tone: 'teal',
      value: 'Spaces',
    });

    const far = getParkingPopupDetails(parkingPoint({ capacity: 11 }, 1_000));
    expect(far.metrics).toEqual([
      {
        icon: 'distance',
        kind: 'distance',
        label: 'Distance',
        tone: 'muted',
        value: '1.0 km away',
      },
    ]);
    expect(far.details[0]).toEqual({
      emphasis: '11',
      icon: 'parking',
      kind: 'spaces',
      label: 'Spaces',
      tone: 'green',
      value: 'Spaces',
    });

    const unknown = getParkingPopupDetails(parkingPoint({ capacity: 0 }));
    expect(unknown.metrics).toEqual([
      {
        icon: 'distance',
        kind: 'distance',
        label: 'Distance',
        tone: 'neutral',
        value: 'Not listed',
      },
    ]);
    expect(unknown.details).toEqual([]);
  });

  it('limits compact popup details to capacity, type and cover', () => {
    const details = getParkingEssentialDetails(
      parkingPoint({
        access: 'private',
        bicycle_pa: 'stands',
        capacity: 12,
        covered: 'yes',
      }),
    );

    expect(details.map((detail) => detail.kind)).toEqual([
      'spaces',
      'type',
      'cover',
    ]);
    expect(details.some((detail) => detail.kind === 'access')).toBe(false);
  });

  it('groups popup stand types into icon categories', () => {
    expect(
      getParkingPopupDetails(parkingPoint({ bicycle_pa: 'wide_stands' }))
        .details[0],
    ).toEqual({
      icon: 'stand',
      kind: 'type',
      label: 'Type',
      tone: 'teal',
      value: 'Wide Stands',
    });
    expect(
      getParkingPopupDetails(parkingPoint({ bicycle_pa: 'rack' })).details[0],
    ).toEqual({
      icon: 'parking',
      kind: 'type',
      label: 'Type',
      tone: 'teal',
      value: 'Rack',
    });
    expect(
      getParkingPopupDetails(parkingPoint({ bicycle_pa: 'shed' })).details[0],
    ).toEqual({
      icon: 'storage',
      kind: 'type',
      label: 'Type',
      tone: 'green',
      value: 'Shed',
    });
    expect(
      getParkingPopupDetails(parkingPoint({ bicycle_pa: 'wall_loops' }))
        .details[0],
    ).toEqual({
      icon: 'fixture',
      kind: 'type',
      label: 'Type',
      tone: 'amber',
      value: 'Wall Loops',
    });
    expect(
      getParkingPopupDetails(parkingPoint({ bicycle_pa: 'artistic' }))
        .details[0],
    ).toEqual({
      icon: 'unknown',
      kind: 'type',
      label: 'Type',
      tone: 'neutral',
      value: 'Artistic',
    });
  });

  it('groups popup cover and access details', () => {
    expect(
      getParkingPopupDetails(parkingPoint({ covered: 'yes', access: 'yes' }))
        .details,
    ).toEqual([
      {
        icon: 'covered',
        kind: 'cover',
        label: 'Cover',
        tone: 'green',
        value: 'Covered',
      },
      {
        icon: 'access-open',
        kind: 'access',
        label: 'Access',
        tone: 'green',
        value: 'Public access',
      },
    ]);

    expect(
      getParkingPopupDetails(parkingPoint({ covered: 'no', access: 'private' }))
        .details,
    ).toEqual([
      {
        icon: 'not-covered',
        kind: 'cover',
        label: 'Cover',
        tone: 'muted',
        value: 'Not covered',
      },
      {
        icon: 'restricted',
        kind: 'access',
        label: 'Access',
        tone: 'restricted',
        value: 'Private',
      },
    ]);

    expect(
      getParkingPopupDetails(parkingPoint({ access: 'customers' })).details[0],
    ).toEqual({
      icon: 'customer',
      kind: 'access',
      label: 'Access',
      tone: 'amber',
      value: 'Customers',
    });
    expect(
      getParkingPopupDetails(parkingPoint({ access: 'university' })).details[0],
    ).toEqual({
      icon: 'university',
      kind: 'access',
      label: 'Access',
      tone: 'teal',
      value: 'University',
    });
    expect(
      getParkingPopupDetails(parkingPoint({ access: 'permissive' })).details[0],
    ).toEqual({
      icon: 'access-open',
      kind: 'access',
      label: 'Access',
      tone: 'green',
      value: 'Permissive',
    });
    expect(
      getParkingPopupDetails(parkingPoint({ access: ' ' })).details,
    ).toHaveLength(0);
    expect(
      getParkingPopupDetails(parkingPoint({ access: 'unknown' })).details,
    ).toHaveLength(0);
  });

  it('localizes parking detail labels and values', () => {
    expect(
      getParkingPopupDetails(
        parkingPoint({ capacity: 8, covered: 'no', access: 'customers' }, 450),
        'es',
      ),
    ).toMatchObject({
      metrics: [{ kind: 'distance', label: 'Distancia', value: 'a 450 m' }],
      details: [
        { kind: 'spaces', label: 'Plazas', value: 'Plazas' },
        { kind: 'cover', label: 'Cubierta', value: 'Sin cubierta' },
        { kind: 'access', label: 'Acceso', value: 'Clientes' },
      ],
    });
  });

  it('keeps dataset provenance out of popup details', () => {
    expect(
      getParkingPopupDetails(
        parkingPoint({
          capacity: 12,
          sourceLabel: 'OpenStreetMap',
        }),
      ).details,
    ).toEqual([
      {
        emphasis: '12',
        icon: 'parking',
        kind: 'spaces',
        label: 'Spaces',
        tone: 'green',
        value: 'Spaces',
      },
    ]);
  });

  it('summarizes populated parking details', () => {
    expect(
      describeParkingPoint({
        id: 'summary',
        name: 'Summary point',
        latitude: 55.9533,
        longitude: -3.1883,
        properties: {
          capacity: 8,
          bicycle_pa: 'stands',
          covered: 'no',
        },
        sourceId: 'test',
      }),
    ).toBe('8 spaces, stands, not covered');
  });

  it('omits unlisted cover from parking summaries', () => {
    expect(
      describeParkingPoint({
        id: 'summary-missing-cover',
        name: 'Summary point',
        latitude: 55.9533,
        longitude: -3.1883,
        properties: {
          capacity: 20,
          bicycle_pa: ' ',
          covered: ' ',
        },
        sourceId: 'test',
      }),
    ).toBe('20 spaces, type not listed');
  });

  it('parses valid place search results and rejects invalid coordinates', () => {
    expect(
      parsePlaceSearchResults({
        features: [
          {
            geometry: { coordinates: [-3.191, 55.941] },
            properties: {
              city: 'Edinburgh',
              country: 'United Kingdom',
              name: 'Meadows',
              osm_id: 123,
              osm_type: 'W',
              state: 'Scotland',
            },
          },
          {
            geometry: { coordinates: [0, 0] },
            properties: { name: 'Null Island', osm_id: 456 },
          },
          {
            geometry: { coordinates: [-3.191, 'not-a-number'] },
            properties: { name: 'Invalid' },
          },
        ],
      }),
    ).toEqual([
      {
        id: 'W:123',
        name: 'Meadows, Edinburgh, Scotland, United Kingdom',
        location: {
          latitude: 55.941,
          longitude: -3.191,
        },
      },
    ]);
  });

  it('parses a valid parking deep-link id', () => {
    expect(parseUrlParkingId('?parking=near')).toBe('near');
    expect(parseUrlParkingId('?parking=%20near%20')).toBe('near');
    expect(parseUrlParkingId('?parking=')).toBeNull();
  });

  it('parses parking links without treating the parking point as the reference location', () => {
    expect(parseShareLinkState('?parking=near')).toEqual({
      selectedParkingId: 'near',
      referenceLocation: null,
    });
  });

  it('parses parking links with explicit URL coordinates as the reference location', () => {
    expect(
      parseShareLinkState('?parking=near&lat=55.9533&lng=-3.1883'),
    ).toEqual({
      selectedParkingId: 'near',
      referenceLocation: {
        latitude: 55.9533,
        longitude: -3.1883,
      },
    });
  });

  it('keeps parking ids for the spatial point index while preserving URL coordinates', () => {
    expect(
      parseShareLinkState('?parking=missing&lat=55.9533&lng=-3.1883'),
    ).toEqual({
      selectedParkingId: 'missing',
      referenceLocation: {
        latitude: 55.9533,
        longitude: -3.1883,
      },
    });
  });

  it('builds parking share links without dropping the current base path', () => {
    expect(
      buildParkingShareUrl('https://taugr.github.io', '/neuk-bike', 'near'),
    ).toBe('https://taugr.github.io/neuk-bike/?parking=near');
  });

  it('builds root-hosted parking share links for the custom domain', () => {
    expect(buildParkingShareUrl('https://neuk.bike', '/', 'near')).toBe(
      'https://neuk.bike/?parking=near',
    );
  });

  it('builds parking share links from an existing share page path', () => {
    expect(
      buildParkingShareUrl(
        'https://taugr.github.io',
        '/neuk-bike/parking/near',
        'far',
      ),
    ).toBe('https://taugr.github.io/neuk-bike/?parking=far');
  });

  it('parses valid URL coordinates and rejects invalid coordinates', () => {
    expect(parseUrlLocation('?lat=55.9533&lng=-3.1883')).toEqual({
      latitude: 55.9533,
      longitude: -3.1883,
    });
    expect(parseUrlLocation('?lat=0&lng=0')).toBeNull();
    expect(parseUrlLocation('?lat=not-a-number&lng=-3.1883')).toBeNull();
  });
});
