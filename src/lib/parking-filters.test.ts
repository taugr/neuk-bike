import { describe, expect, it } from 'vitest';
import {
  countActiveParkingFilters,
  defaultParkingFilters,
  evaluateParkingFilters,
  filterAndSortParkingPoints,
  firstUncertainParkingResultIndex,
  summarizeParkingFilterResults,
  type ParkingFilters,
} from '@/lib/parking-filters';
import type { ParkingPoint } from '@/lib/types';

function point(
  id: string,
  distanceMeters: number,
  properties: ParkingPoint['properties'] = {},
): ParkingPoint {
  return {
    id,
    distanceMeters,
    latitude: 55.95,
    longitude: -3.19,
    name: id,
    properties,
    sourceId: 'test',
  };
}

function filters(overrides: Partial<ParkingFilters>): ParkingFilters {
  return { ...defaultParkingFilters, ...overrides };
}

describe('parking filters', () => {
  it('counts only active preferences', () => {
    expect(countActiveParkingFilters(defaultParkingFilters)).toBe(0);
    expect(
      countActiveParkingFilters(
        filters({ covered: true, frameLockable: true, minimumCapacity: 6 }),
      ),
    ).toBe(3);
  });

  it('keeps unknown values after confirmed matches and excludes known failures', () => {
    const selected = filters({ covered: true, minimumCapacity: 6 });
    const matches = filterAndSortParkingPoints(
      [
        point('match', 100, { capacity: 8, covered: 'yes' }),
        point('unknown', 50, { capacity: 0, covered: '' }),
        point('too-small', 20, { capacity: 4, covered: 'yes' }),
        point('uncovered', 10, { capacity: 12, covered: 'no' }),
      ],
      selected,
      'nearest',
    );

    expect(matches.map(({ id }) => id)).toEqual(['match', 'unknown']);
    expect(summarizeParkingFilterResults(matches, selected)).toEqual({
      completeMatchCount: 1,
      eligibleCount: 2,
      unknownMatchCount: 1,
    });
  });

  it('keeps distance order within confirmed and uncertain groups', () => {
    const selected = filters({ covered: true });
    const result = filterAndSortParkingPoints(
      [
        point('unknown-far', 80),
        point('match-far', 100, { covered: 'yes' }),
        point('unknown-near', 20),
        point('match-near', 50, { covered: 'yes' }),
      ],
      selected,
      'nearest',
    );

    expect(result.map(({ id }) => id)).toEqual([
      'match-near',
      'match-far',
      'unknown-near',
      'unknown-far',
    ]);
    expect(firstUncertainParkingResultIndex(result, selected)).toBe(2);
  });

  it('treats only unrestricted or permissive access as public', () => {
    const selected = filters({ publicAccess: true });

    expect(
      evaluateParkingFilters(point('yes', 1, { access: 'yes' }), selected),
    ).toMatchObject({ matchCount: 1 });
    expect(
      evaluateParkingFilters(
        point('permissive', 1, { access: 'permissive' }),
        selected,
      ),
    ).toMatchObject({ matchCount: 1 });
    expect(
      evaluateParkingFilters(
        point('customers', 1, { access: 'customers' }),
        selected,
      ),
    ).toMatchObject({ failCount: 1 });
    expect(
      evaluateParkingFilters(
        point('unknown', 1, { access: 'unknown' }),
        selected,
      ),
    ).toMatchObject({ unknownCount: 1 });
  });

  it('classifies known frame-lockable and wheel-only stand types', () => {
    const selected = filters({ frameLockable: true });

    expect(
      evaluateParkingFilters(
        point('stands', 1, { bicycle_pa: 'stands' }),
        selected,
      ),
    ).toMatchObject({ matchCount: 1 });
    expect(
      evaluateParkingFilters(
        point('loops', 1, { bicycle_pa: 'wall_loops' }),
        selected,
      ),
    ).toMatchObject({ failCount: 1 });
    expect(
      evaluateParkingFilters(
        point('custom', 1, { bicycle_pa: 'custom_type' }),
        selected,
      ),
    ).toMatchObject({ unknownCount: 1 });
  });

  it('keeps ambiguous stand types visible as unknown', () => {
    const selected = filters({ frameLockable: true });

    for (const bicycleParking of [
      'anchors',
      'handlebar_holder',
      'informal',
      'two-tier',
      'upright_stands',
      'vertical_stand',
      'wave',
    ]) {
      expect(
        evaluateParkingFilters(
          point(bicycleParking, 1, { bicycle_pa: bicycleParking }),
          selected,
        ),
      ).toMatchObject({ failCount: 0, unknownCount: 1 });
    }

    expect(
      evaluateParkingFilters(
        point('front-wheel-only', 1, {
          bicycle_pa: 'front_wheel_only',
        }),
        selected,
      ),
    ).toMatchObject({ failCount: 1 });
  });

  it('uses explicit cargo-bike access or capacity without inferring suitability', () => {
    const selected = filters({ cargoBike: true });

    expect(
      evaluateParkingFilters(
        point('designated', 1, { cargo_bike: 'designated' }),
        selected,
      ),
    ).toMatchObject({ matchCount: 1 });
    expect(
      evaluateParkingFilters(
        point('capacity', 1, { capacity_cargo_bike: 2 }),
        selected,
      ),
    ).toMatchObject({ matchCount: 1 });
    expect(
      evaluateParkingFilters(point('no', 1, { cargo_bike: 'no' }), selected),
    ).toMatchObject({ failCount: 1 });
    expect(
      evaluateParkingFilters(
        point('unknown', 1, { bicycle_pa: 'wide_stands' }),
        selected,
      ),
    ).toMatchObject({ unknownCount: 1 });
  });

  it('puts complete matches before unknowns in Best match mode', () => {
    const selected = filters({ covered: true, minimumCapacity: 6 });
    const result = filterAndSortParkingPoints(
      [
        point('unknown-near', 20, { capacity: 8 }),
        point('match-far', 100, { capacity: 8, covered: 'yes' }),
        point('match-near', 50, { capacity: 12, covered: 'yes' }),
      ],
      selected,
      'best-match',
    );

    expect(result.map(({ id }) => id)).toEqual([
      'match-near',
      'match-far',
      'unknown-near',
    ]);
  });

  it('falls back to nearest when Best match has no preferences to score', () => {
    const result = filterAndSortParkingPoints(
      [point('far', 100), point('near', 20)],
      defaultParkingFilters,
      'best-match',
    );

    expect(result.map(({ id }) => id)).toEqual(['near', 'far']);
  });
});
