import { afterEach, describe, expect, it, vi } from 'vitest';
import { MercatorCoordinate, type Map as LibreMap } from 'maplibre-gl';
import { createRainRenderer } from './rain-renderer';
import type { RainSnapshot } from './rain';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fixture(
  rate = 4,
  pitch = 0,
  snowRate = 0,
  weatherCode = 63,
  reducedMotion = false,
) {
  vi.stubGlobal('window', {
    devicePixelRatio: 1,
    matchMedia: () => ({
      matches: reducedMotion,
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
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    fillRect: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
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
    getPitch: () => pitch,
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
      snowRate,
      weatherCode,
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
  it.each([45, 48])(
    'renders fog code %s without rain and clears it when conditions change',
    (code) => {
      const f = fixture(0, 0, 0, code);
      expect(f.canvas.dataset.rainParticles).toBe('0');
      expect(Number(f.canvas.dataset.fogCount)).toBeGreaterThan(0);
      expect(f.ctx.createRadialGradient).toHaveBeenCalled();
      expect(requestAnimationFrame).toHaveBeenCalled();
      f.pan();
      expect(Number(f.canvas.dataset.fogCount)).toBeGreaterThan(0);
      f.snapshot.samples.forEach((p) => {
        p.weatherCode = 3;
      });
      f.renderer.update(f.snapshot);
      f.frame();
      expect(f.canvas.dataset.fogCount).toBe('0');
      f.renderer.destroy();
    },
  );
  it('keeps fog still under reduced motion without an animation loop', () => {
    const f = fixture(0, 55, 0, 45, true);
    const positions = f.ctx.translate.mock.calls.slice();
    f.ctx.translate.mockClear();
    vi.mocked(performance.now).mockReturnValue(19300);
    f.frame();
    expect(f.ctx.translate.mock.calls).toEqual(positions);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    f.renderer.destroy();
  });
  it('shows denser, longer rain strokes for heavy rain than drizzle', () => {
    function measure(rate: number) {
      const f = fixture(rate);
      f.ctx.moveTo.mockClear();
      f.frame();
      const count = Number(f.canvas.dataset.rainParticles);
      const lengths = f.ctx.lineTo.mock.calls.map(([x, y], i) => {
        const [a, b] = f.ctx.moveTo.mock.calls[i];
        return Math.hypot(x - a, y - b);
      });
      f.renderer.destroy();
      return { count, length: Math.max(...lengths) };
    }
    const drizzle = measure(0.1),
      heavy = measure(12);
    expect(heavy.count).toBeGreaterThan(drizzle.count * 3);
    expect(heavy.length).toBeGreaterThan(drizzle.length * 2);
  });
  it('renders pure snow as flakes, and mixed precipitation as both flakes and rain', () => {
    const f = fixture(0, 55, 0.5, 71);
    expect(Number(f.canvas.dataset.snowCount)).toBeGreaterThan(50);
    expect(f.canvas.dataset.rainCount).toBe('0');
    expect(f.ctx.arc).toHaveBeenCalled();
    expect(f.ctx.fill).toHaveBeenCalled();
    f.snapshot.samples.forEach((p) => {
      p.rate = 4;
    });
    f.renderer.update(f.snapshot);
    f.frame();
    expect(Number(f.canvas.dataset.snowCount)).toBeGreaterThan(0);
    expect(Number(f.canvas.dataset.rainCount)).toBeGreaterThan(0);
    f.pan();
    expect(Number(f.canvas.dataset.snowCount)).toBeGreaterThan(0);
    f.renderer.destroy();
  });
  it('uses distinct hail and freezing rain particles', () => {
    const f = fixture(12, 0, 0, 99);
    expect(Number(f.canvas.dataset.hailCount)).toBeGreaterThan(0);
    expect(f.ctx.closePath).toHaveBeenCalled();
    f.snapshot.samples.forEach((p) => {
      p.weatherCode = 67;
    });
    f.renderer.update(f.snapshot);
    f.frame();
    expect(f.canvas.dataset.hailCount).toBe('0');
    expect(Number(f.canvas.dataset.freezingCount)).toBeGreaterThan(0);
    expect(f.canvas.dataset.stormCells).toBe('0');
    f.renderer.destroy();
  });
  it('animates occasional local lightning even in dry thunderstorms, then clears it with new conditions', () => {
    const f = fixture(0, 0, 0, 95);
    expect(f.canvas.dataset.rainParticles).toBe('0');
    expect(Number(f.canvas.dataset.stormCells)).toBeGreaterThan(0);
    vi.mocked(performance.now).mockReturnValue(9300);
    f.frame();
    expect(f.canvas.dataset.lightning).toBe('visible');
    vi.mocked(performance.now).mockReturnValue(10000);
    f.frame();
    expect(f.canvas.dataset.lightning).toBe('idle');
    f.snapshot.samples.forEach((p) => {
      p.weatherCode = 3;
    });
    f.renderer.update(f.snapshot);
    vi.mocked(performance.now).mockReturnValue(18300);
    f.frame();
    expect(f.canvas.dataset.lightning).toBe('idle');
    expect(f.canvas.dataset.stormCells).toBe('0');
    f.renderer.destroy();
  });
  it('keeps snow and the storm symbol static with reduced motion and stops animation', () => {
    const f = fixture(0, 55, 1, 95, true);
    const positions = f.ctx.arc.mock.calls.slice();
    f.ctx.arc.mockClear();
    vi.mocked(performance.now).mockReturnValue(19300);
    f.frame();
    expect(f.ctx.arc.mock.calls).toEqual(positions);
    expect(f.canvas.dataset.lightning).toBe('static');
    expect(f.canvas.dataset.motion).toBe('static');
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    f.renderer.destroy();
  });
  it('keeps rain strokes legible when projected cloud height collapses at country scale', () => {
    const f = fixture(4, 55);
    f.ctx.moveTo.mockClear();
    f.frame();
    const lengths = f.ctx.lineTo.mock.calls.map(([x, y], i) => {
      const [startX, startY] = f.ctx.moveTo.mock.calls[i];
      return Math.hypot(x - startX, y - startY);
    });
    expect(lengths.filter((length) => length > 6).length).toBeGreaterThan(100);
    f.renderer.destroy();
  });
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
