import { describe, expect, it, vi } from 'vitest';
import type { ParkingPoint } from '@/lib/types';
import {
  addSavedNeuk,
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

describe('saved neuks', () => {
  it('parses valid records and discards malformed or duplicate items', () => {
    expect(
      parseSavedNeuks(
        JSON.stringify({
          version: 1,
          items: [
            addSavedNeuk([], point, savedAt)[0],
            { id: 'broken' },
            addSavedNeuk([], point, '2026-07-19T12:00:00.000Z')[0],
          ],
        }),
      ),
    ).toEqual(addSavedNeuk([], point, savedAt));
  });

  it.each([null, '', '{', '{"version":2,"items":[]}'])(
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
    expect(isNeukSaved(added, point.id)).toBe(true);
    expect(removeSavedNeuk(added, 'missing')).toBe(added);
    expect(removeSavedNeuk(added, point.id)).toEqual([]);
    expect(added).toHaveLength(1);
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
      JSON.stringify({ items, version: 1 }),
    );

    storage.getItem.mockReturnValue(JSON.stringify({ items, version: 1 }));
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
