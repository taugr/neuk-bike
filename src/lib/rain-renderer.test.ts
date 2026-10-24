import { afterEach, describe, expect, it, vi } from 'vitest';
import { MercatorCoordinate, type Map as LibreMap } from 'maplibre-gl';
import { createRainRenderer } from './rain-renderer';
import type { RainSnapshot } from './rain';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fixture(rate = 4) {
  vi.stubGlobal('window', {
    devicePixelRatio: 1,
    matchMedia: () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
  vi.stubGlobal('document', {
    hidden: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(performance, 'now').mockReturnValue(1000);
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
  const canvas = {
    width: 800,
    height: 600,
    dataset: {} as Record<string, string>,
    getContext: () => ctx,
  };
  let centre = 0.5;
  const span = 0.001;
  let layer: { render: (_gl: unknown, args: unknown) => void };
  const events = new Map<string, () => void>();
  const map = {
    getContainer: () => ({ clientWidth: 800, clientHeight: 600 }),
    getTerrain: () => null,
    getZoom: () => 14,
    getPitch: () => 0,
    unproject: ([x, y]: number[]) =>
      new MercatorCoordinate(
        centre + (x / 800 - 0.5) * span,
        0.5 + (y / 600 - 0.5) * span,
      ).toLngLat(),
    getLayer: () => layer,
    addLayer: (next: typeof layer) => {
      layer = next;
    },
    removeLayer: vi.fn(),
    triggerRepaint: vi.fn(),
    on: (event: string, fn: () => void) => {
      events.set(event, fn);
    },
    off: vi.fn(),
  };
  const snapshot: RainSnapshot = {
    key: 'test',
    bounds: { west: -5, east: 5, south: -5, north: 5 },
    samples: Array.from({ length: 20 }, (_, i) => ({
      longitude: -5 + (i % 5) * 2.5,
      latitude: -5 + (Math.floor(i / 5) * 10) / 3,
      rate,
      elevation: 0,
    })),
    fetchedAt: Date.now(),
    validAt: Date.now(),
  };
  const renderer = createRainRenderer(
    map as unknown as LibreMap,
    canvas as unknown as HTMLCanvasElement,
  );
  function frame() {
    ctx.lineTo.mockClear();
    layer.render(null, {
      defaultProjectionData: {
        mainMatrix: [
          2 / span,
          0,
          0,
          0,
          0,
          -2 / span,
          0,
          0,
          0,
          0,
          0,
          0,
          (-2 * centre) / span,
          1 / span,
          0,
          1,
        ],
      },
    });
  }
  renderer.update(snapshot);
  frame();
  return {
    renderer,
    snapshot,
    canvas,
    ctx,
    frame,
    pan: () => {
      centre += span * 1.5;
      frame();
    },
    settle: () => events.get('moveend')!(),
  };
}

describe('rain animation continuity', () => {
  it('fills the visible map during a pan before moveend', () => {
    const f = fixture();
    f.pan();
    const visible = f.ctx.lineTo.mock.calls.filter(
      ([x, y]) => x >= 0 && x < 800 && y >= 0 && y < 600,
    );
    expect(visible.length).toBeGreaterThan(100);
    f.renderer.destroy();
  });

  it('keeps droplet positions and phases when fresh data replaces a grid', () => {
    const f = fixture();
    f.settle();
    f.frame();
    const before = f.ctx.lineTo.mock.calls.map((p) => JSON.stringify(p));
    f.renderer.update({ ...f.snapshot, key: 'next-grid' });
    f.frame();
    const after = new Set(
      f.ctx.lineTo.mock.calls.map((p) => JSON.stringify(p)),
    );
    expect(
      before.filter((p) => after.has(p)).length / before.length,
    ).toBeGreaterThan(0.95);
    f.renderer.destroy();
  });

  it('does not increase drizzle density on repeated camera updates', () => {
    const f = fixture(0.1);
    f.settle();
    const before = Number(f.canvas.dataset.rainParticles);
    for (let i = 0; i < 20; i++) f.settle();
    expect(
      Math.abs(Number(f.canvas.dataset.rainParticles) - before),
    ).toBeLessThan(5);
    f.renderer.destroy();
  });
});
