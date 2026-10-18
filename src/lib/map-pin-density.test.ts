import { describe, expect, it } from 'vitest';
import { selectScreenPins, type ScreenPin } from './map-pin-density';

const area = { left: 0, top: 0, right: 390, bottom: 700 };
const grid: ScreenPin[] = Array.from({ length: 240 }, (_, i) => ({
  id: `pin-${i}`,
  x: 10 + (i % 12) * 32,
  y: 10 + Math.floor(i / 12) * 34,
  protected: false,
}));
const select = (pins = grid, options = {}) =>
  selectScreenPins({
    pins,
    area,
    zoom: 14,
    pitch: 55,
    previous: new Set(),
    ...options,
  });

describe('perspective pin density', () => {
  it('spaces ordinary pins while retaining every protected pin, including overlapping ones', () => {
    const pins = [
      ...grid,
      ...['selected', 'saved', 'ranked'].map((id) => ({
        id,
        x: 100,
        y: 100,
        protected: true,
      })),
    ];
    const ids = select(pins);
    expect(ids.size).toBeLessThan(grid.length / 2);
    for (const id of ['selected', 'saved', 'ranked'])
      expect(ids.has(id)).toBe(true);
    const ordinary = pins.filter((pin) => ids.has(pin.id) && !pin.protected);
    expect(
      ordinary.every((pin) => Math.hypot(pin.x - 100, pin.y - 100) >= 40),
    ).toBe(true);
  });
  it('reduces distant clutter and reveals more with zoom or a flatter view', () => {
    const tilted = select();
    const foreground = grid.filter((pin) => pin.y > 350 && tilted.has(pin.id));
    const distant = grid.filter((pin) => pin.y < 350 && tilted.has(pin.id));
    expect(foreground.length).toBeGreaterThan(distant.length);
    expect(select(grid, { zoom: 18 }).size).toBeGreaterThan(tilted.size);
    expect(select(grid, { pitch: 0 }).size).toBeGreaterThan(tilted.size);
  });
  it('uses stable priorities regardless of source ordering and retains pins through a small pan', () => {
    const initial = select();
    expect(select([...grid].reverse())).toEqual(initial);
    const shifted = grid.map((pin) => ({ ...pin, x: pin.x + 2, y: pin.y + 1 }));
    const moved = select(shifted, { previous: initial });
    expect([...initial].filter((id) => moved.has(id))).toHaveLength(
      initial.size,
    );
    expect(select(shifted, { previous: moved })).toEqual(moved);
  });
  it('buffers the viewport edge but rejects remote and unprojectable ordinary points', () => {
    const pins = [
      { id: 'edge', x: -30, y: 300, protected: false },
      { id: 'remote', x: -200, y: 300, protected: false },
      { id: 'invalid', x: NaN, y: 100, protected: false },
      { id: 'protected', x: -500, y: 0, protected: true },
    ];
    expect(select(pins)).toEqual(new Set(['edge', 'protected']));
  });
});
