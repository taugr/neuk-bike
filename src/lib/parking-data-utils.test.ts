import { describe, expect, it } from 'vitest';
import {
  deduplicateParkingPoints,
  deriveParkingNames,
  getTileKey,
  isGenericParkingName,
  mergeParkingSources,
  normalizeOsmProperties,
  parseGeofabrikPoly,
  representativePoint,
  shouldMergeCouncilAndOsm,
} from '../../scripts/parking-data-utils.mjs';

function point(
  id: string,
  latitude: number,
  longitude: number,
  properties: Record<string, string | number> = {},
) {
  return { id, latitude, longitude, name: id, properties, sourceId: 'test' };
}

describe('parking data generation utilities', () => {
  it('creates stable tile keys and representative points', () => {
    expect(getTileKey({ latitude: 55.9533, longitude: -3.1883 })).toBe(
      '12/2011/1276',
    );
    expect(
      representativePoint([
        { latitude: 56, longitude: -4 },
        { latitude: 58, longitude: -2 },
      ]),
    ).toEqual({ latitude: 57, longitude: -3 });
    expect(representativePoint([])).toBeNull();
  });

  it('merges exact neighbours and attribute-backed nearby records', () => {
    const council = point('cec:1', 55.95, -3.19, { capacity: 12 });
    const exactOsm = point('osm:node:1', 55.95002, -3.19);
    const nearbyMatchingOsm = point('osm:node:2', 55.9501, -3.19, {
      capacity: 12,
    });
    const nearbyDifferentOsm = point('osm:node:3', 55.9501, -3.19, {
      capacity: 6,
    });

    expect(shouldMergeCouncilAndOsm(council, exactOsm)).toBe(true);
    expect(shouldMergeCouncilAndOsm(council, nearbyMatchingOsm)).toBe(true);
    expect(shouldMergeCouncilAndOsm(council, nearbyDifferentOsm)).toBe(false);
  });

  it('keeps the council point and reports the suppressed OSM candidate', () => {
    const council = point('cec:1', 55.95, -3.19, { covered: 'yes' });
    const osm = point('osm:node:1', 55.95001, -3.19, { covered: 'yes' });
    const merged = mergeParkingSources([council], [osm]);

    expect(merged.points).toEqual([council]);
    expect(merged.matches).toEqual([
      expect.objectContaining({ councilId: council.id, osmId: osm.id }),
    ]);
  });

  it('deduplicates overlapping regional extracts by stable OSM ID', () => {
    const original = point('osm:node:1', 55.95, -3.19);
    const duplicate = { ...original, name: 'Duplicate copy' };
    const other = point('osm:node:2', 51.5, -0.12);

    expect(deduplicateParkingPoints([original, duplicate, other])).toEqual({
      duplicateIds: ['osm:node:1'],
      points: [original, other],
    });
  });

  it('parses included and excluded Geofabrik polygon rings', () => {
    const area = parseGeofabrikPoly(
      `example\n1\n -5 50\n 2 50\n 2 56\n -5 56\nEND\n!2\n -4 51\n -3 51\n -3 52\n -4 52\nEND\nEND\n`,
      'england',
      'England',
    );

    expect(area.bounds).toEqual({ east: 2, north: 56, south: 50, west: -5 });
    expect(area.rings).toHaveLength(2);
    expect(area.rings[1].exclude).toBe(true);
  });

  it('normalizes useful OSM fields without shipping every raw tag', () => {
    expect(
      normalizeOsmProperties({
        access: 'customers',
        bicycle_parking: 'stands',
        capacity: '12',
        covered: 'yes',
        name: 'not copied into properties',
      }),
    ).toEqual({
      access: 'customers',
      bicycle_pa: 'stands',
      capacity: 12,
      covered: 'yes',
      fee: '',
      operator: '',
    });
  });

  it('rejects generic source labels but preserves descriptive names', () => {
    expect(isGenericParkingName('Cycle parking')).toBe(true);
    expect(isGenericParkingName('Cycle parking 42')).toBe(true);
    expect(isGenericParkingName('Bike lockers')).toBe(true);
    expect(isGenericParkingName('Waverley Station cycle racks')).toBe(false);
  });

  it('derives stable names from junctions, landmarks, streets, and places', () => {
    const contexts = {
      junctions: [
        {
          latitude: 55.95,
          longitude: -3.19,
          names: ['High Street', 'Market Street'],
        },
      ],
      landmarks: [
        {
          latitude: 55.951,
          longitude: -3.191,
          name: 'Central Library',
        },
      ],
      places: [{ latitude: 56.1, longitude: -3.1, name: 'Exampleton' }],
      roads: [
        { latitude: 55.95, longitude: -3.19, name: 'High Street' },
        { latitude: 55.951, longitude: -3.191, name: 'Library Road' },
      ],
    };
    const result = deriveParkingNames(
      [
        { ...point('junction', 55.95, -3.19), name: 'Cycle parking' },
        { ...point('landmark', 55.951, -3.191), name: 'Bike stands' },
        { ...point('place', 56.1, -3.1), name: 'Cycle parking 3' },
        { ...point('source', 57, -4), name: 'Named bike hub' },
      ],
      contexts,
    );

    expect(result.points.map(({ name }) => name)).toEqual([
      'High Street near Market Street',
      'Library Road by Central Library',
      'Exampleton cycle parking',
      'Named bike hub',
    ]);
    expect(result.counts).toMatchObject({
      junction: 1,
      landmark: 1,
      place: 1,
      source: 1,
    });
  });
});
