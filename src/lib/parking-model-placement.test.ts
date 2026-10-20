import { describe, expect, it } from 'vitest';
import {
  boundsOverlap,
  modelPlacementLimit,
  offsetModelLocation,
  placeParkingModels,
  placeModelButtons,
  type ModelOffset,
} from './parking-model-placement';
import { distanceMeters } from './geo';

describe('bounded parking illustration placement', () => {
  const anchors: Record<string, [number, number]> = {
    a: [100, 100],
    b: [106, 100],
    c: [300, 300],
  };
  const project = (id: string, offset: ModelOffset) => {
    const [x, y] = anchors[id];
    return {
      left: x + offset.east * 4 - 10,
      right: x + offset.east * 4 + 10,
      top: y - offset.north * 4 - 10,
      bottom: y - offset.north * 4 + 10,
    };
  };
  it('separates close symbols, leaves isolated sites unchanged, and keeps all identities', () => {
    const layout = placeParkingModels({ ids: ['a', 'b', 'c'], project });
    expect(layout).toHaveLength(3);
    expect(layout.flatMap((p) => p.members)).toEqual(['a', 'b', 'c']);
    expect(layout.find((p) => p.id === 'c')!.offset).toEqual({
      east: 0,
      north: 0,
    });
    for (const placed of layout)
      expect(
        Math.hypot(placed.offset.east, placed.offset.north),
      ).toBeLessThanOrEqual(modelPlacementLimit + 1e-8);
    expect(
      boundsOverlap(
        project('a', layout[0].offset),
        project('b', layout[1].offset),
      ),
    ).toBe(false);
  });
  it('is independent of input order and retains a valid previous arrangement', () => {
    const layout = placeParkingModels({ ids: ['c', 'b', 'a'], project });
    expect(placeParkingModels({ ids: ['a', 'b', 'c'], project })).toEqual(
      layout,
    );
    expect(
      placeParkingModels({
        ids: ['b', 'a', 'c'],
        project,
        previous: new Map(layout.map((p) => [p.id, p.offset])),
      }),
    ).toEqual(layout);
  });
  it('moves both members when keeping the first fixed would force an unnecessary group', () => {
    const projectPair = (_id: string, offset: ModelOffset) => ({
      left: offset.east * 4 - 25,
      right: offset.east * 4 + 25,
      top: offset.north * 4 - 25,
      bottom: offset.north * 4 + 25,
    });
    const layout = placeParkingModels({
      ids: ['a', 'b'],
      project: projectPair,
    });
    expect(layout).toHaveLength(2);
    expect(
      layout.every((p) => Math.hypot(p.offset.east, p.offset.north) <= 8.0001),
    ).toBe(true);
    expect(
      boundsOverlap(
        projectPair('a', layout[0].offset),
        projectPair('b', layout[1].offset),
      ),
    ).toBe(false);
  });
  it('packs four large roofs together when they require coordinated offsets', () => {
    const projectRoofs = (_id: string, offset: ModelOffset) => ({
      left: offset.east * 10 - 40,
      right: offset.east * 10 + 40,
      top: offset.north * 10 - 40,
      bottom: offset.north * 10 + 40,
    });
    const layout = placeParkingModels({
      ids: ['a', 'b', 'c', 'd'],
      project: projectRoofs,
    });
    expect(layout).toHaveLength(4);
    for (let i = 0; i < layout.length; i++)
      for (let j = i + 1; j < layout.length; j++)
        expect(
          boundsOverlap(
            projectRoofs(layout[i].id, layout[i].offset),
            projectRoofs(layout[j].id, layout[j].offset),
          ),
        ).toBe(false);
  });
  it('returns impossible collisions as a reachable group, then separates when there is room', () => {
    const crowded = (id: string, offset: ModelOffset) => {
      const bounds = project(id, offset);
      return { ...bounds, right: bounds.left + 150, bottom: bounds.top + 150 };
    };
    const layout = placeParkingModels({
      ids: ['a', 'b', 'c'],
      project: crowded,
    });
    expect(layout.find((p) => p.id === 'a')!.members).toEqual(['a', 'b']);
    expect(layout.find((p) => p.id === 'a')!.offset).toEqual({
      east: 0,
      north: 0,
    });
    expect(placeParkingModels({ ids: ['a', 'b', 'c'], project })).toHaveLength(
      3,
    );
  });
  it('handles coincident coordinates without losing records or producing invalid offsets', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `neuk-${i}`);
    const layout = placeParkingModels({
      ids,
      project: (_id, offset) => project('a', offset),
    });
    expect(layout.flatMap((p) => p.members).sort()).toEqual([...ids].sort());
    for (const p of layout)
      expect(Number.isFinite(p.offset.east + p.offset.north)).toBe(true);
  });
  it('rejects an out-of-range previous offset and recovers real anchors when clear', () => {
    const previous = new Map([
      ['a', { east: 1000, north: 0 }],
      ['c', { east: 4, north: 0 }],
    ]);
    const layout = placeParkingModels({
      ids: ['a', 'b', 'c'],
      project,
      previous,
    });
    expect(layout.find((p) => p.id === 'c')!.offset).toEqual({
      east: 0,
      north: 0,
    });
    expect(
      Math.hypot(layout[0].offset.east, layout[0].offset.north),
    ).toBeLessThanOrEqual(8);
  });
  it.each([55.95, 40.18, -35])(
    'converts metre offsets accurately at latitude %s without mutating coordinates',
    (latitude) => {
      const original = { longitude: -3.19, latitude };
      const shifted = offsetModelLocation(
        original.longitude,
        original.latitude,
        { east: 4.8, north: 6.4 },
      );
      expect(distanceMeters(original, shifted)).toBeCloseTo(8, 3);
      expect(original).toEqual({ longitude: -3.19, latitude });
    },
  );
});

describe('model touch controls', () => {
  it('keeps dense 44px targets separated, visible, and outside nearby model roofs', () => {
    const area = { left: 0, right: 390, top: 80, bottom: 600 };
    const obstacles = [{ left: 130, right: 250, top: 240, bottom: 380 }];
    const buttons = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      ground: { x: 190, y: 330 },
      preferred: [0, 26] as [number, number],
    }));
    const layout = placeModelButtons(buttons, obstacles, area);
    const boxes = buttons.map(({ id, ground }) => {
      const [x, y] = layout.get(id)!;
      return {
        left: ground.x + x - 22,
        right: ground.x + x + 22,
        top: ground.y + y - 22,
        bottom: ground.y + y + 22,
      };
    });
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(area.left);
      expect(box.right).toBeLessThanOrEqual(area.right);
      expect(box.top).toBeGreaterThanOrEqual(area.top);
      expect(box.bottom).toBeLessThanOrEqual(area.bottom);
      expect(boundsOverlap(box, obstacles[0], 0)).toBe(false);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        expect(boundsOverlap(boxes[i], boxes[j], 0)).toBe(false);
    expect(placeModelButtons([...buttons].reverse(), obstacles, area)).toEqual(
      layout,
    );
  });
  it('does not pull an offscreen neuk into the visible area', () => {
    expect(
      placeModelButtons(
        [{ id: 'offscreen', ground: { x: -100, y: 300 }, preferred: [0, 26] }],
        [],
        { left: 0, right: 390, top: 0, bottom: 600 },
      ).get('offscreen'),
    ).toEqual([0, 26]);
  });
});
