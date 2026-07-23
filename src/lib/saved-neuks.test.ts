import { describe, expect, it, vi } from 'vitest';
import type { CyclingPoiPoint, ParkingPoint } from '@/lib/types';
import {
  addSavedNeuk,
  getPointSavedNeukKey,
  getSavedNeukKey,
  isNeukSaved,
  parseSavedNeuks,
  readSavedNeuks,
  removeSavedNeuk,
  savedNeuksStorageKey,
  writeSavedNeuks,
} from '@/lib/saved-neuks';

const point: ParkingPoint = {
  id: 'osm:node:1',
  latitude: 55.9533,
  longitude: -3.1883,
  name: 'Waverley Bridge cycle parking',
  properties: {},
  sourceId: 'osm',
};
const savedAt = '2026-07-18T12:00:00.000Z';
const shop: CyclingPoiPoint = {
  ...point,
  categories: ['shop'],
  name: 'Waverley Cycles',
  properties: { openingHours: 'Mo-Fr 09:00-17:00' },
};

describe('saved neuks', () => {
  it('parses valid records and discards malformed or duplicate items', () => {
    expect(
      parseSavedNeuks(
        JSON.stringify({
          version: 2,
          items: [
            addSavedNeuk([], point, savedAt)[0],
            { id: 'broken' },
            addSavedNeuk([], point, '2026-07-19T12:00:00.000Z')[0],
          ],
        }),
      ),
    ).toEqual(addSavedNeuk([], point, savedAt));
  });

  it('migrates version-1 parking records to compound keys', () => {
    const legacy = {
      id: point.id,
      savedAt,
      snapshot: {
        latitude: point.latitude,
        longitude: point.longitude,
        name: point.name,
      },
    };

    expect(
      parseSavedNeuks(JSON.stringify({ items: [legacy], version: 1 })),
    ).toEqual([
      {
        ...legacy,
        key: getSavedNeukKey('parking', point.id),
        kind: 'parking',
      },
    ]);
  });

  it.each([null, '', '{', '{"version":3,"items":[]}'])(
    'treats unsupported input %j as empty',
    (value) => {
      expect(parseSavedNeuks(value)).toEqual([]);
    },
  );

  it('adds and removes records immutably without duplicating IDs', () => {
    const original: ReturnType<typeof addSavedNeuk> = [];
    const added = addSavedNeuk(original, point, savedAt);

    expect(original).toEqual([]);
    expect(added).toHaveLength(1);
    expect(addSavedNeuk(added, point, savedAt)).toBe(added);
    expect(isNeukSaved(added, point)).toBe(true);
    expect(removeSavedNeuk(added, 'missing')).toBe(added);
    expect(removeSavedNeuk(added, getPointSavedNeukKey(point))).toEqual([]);
    expect(added).toHaveLength(1);
  });

  it('keeps parking and cycling places distinct when their raw IDs match', () => {
    const items = addSavedNeuk(addSavedNeuk([], point, savedAt), shop, savedAt);

    expect(items).toHaveLength(2);
    expect(items.map(({ key }) => key)).toEqual([
      getSavedNeukKey('cycling-place', point.id),
      getSavedNeukKey('parking', point.id),
    ]);
    expect(items[0].snapshot).toMatchObject({
      categories: ['shop'],
      openingHours: 'Mo-Fr 09:00-17:00',
    });
  });

  it('reads and writes the versioned payload', () => {
    const storage = {
      getItem: vi.fn(() => null as string | null),
      setItem: vi.fn(),
    };
    const items = addSavedNeuk([], point, savedAt);

    expect(writeSavedNeuks(storage, items)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(
      savedNeuksStorageKey,
      JSON.stringify({ items, version: 2 }),
    );

    storage.getItem.mockReturnValue(JSON.stringify({ items, version: 2 }));
    expect(readSavedNeuks(storage)).toEqual({ items, ok: true });
  });

  it('contains storage read and write failures', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(() => {
        throw new Error('quota');
      }),
    };

    expect(readSavedNeuks(storage)).toEqual({ items: [], ok: false });
    expect(writeSavedNeuks(storage, [])).toBe(false);
  });
});
