import { describe, expect, it, vi } from 'vitest';
import {
  enumerateOfflineMapTiles,
  fetchOfflineMapMetadata,
  isAllowedOfflineMapUrl,
  planOfflineMapTiles,
  type OfflineMapMetadata,
} from '@/lib/offline-map-tiles';
import { maximumOfflineAreaBytes } from '@/lib/offline-areas';

const style = {
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [{ layout: { 'text-font': ['Noto Sans Regular'] } }],
  sources: {
    naturalEarth: {
      tiles: [
        'https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png',
      ],
      type: 'raster',
    },
    openmaptiles: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
    },
  },
  sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
};

const metadata: OfflineMapMetadata = {
  refreshedAt: '2026-08-20T00:00:00.000Z',
  styles: {
    dark: {
      style,
      url: 'https://tiles.openfreemap.org/styles/dark',
    },
    liberty: { style, url: 'https://tiles.openfreemap.org/styles/liberty' },
  },
  tileJson: {
    data: {
      tiles: [
        'https://tiles.openfreemap.org/planet/20260304_001001_pt/{z}/{x}/{y}.pbf',
      ],
    },
    url: 'https://tiles.openfreemap.org/planet',
  },
};

describe('enumerateOfflineMapTiles', () => {
  it('enumerates the containing XYZ tiles without wrapping an ordinary area', () => {
    expect(
      enumerateOfflineMapTiles({ east: 1, north: 1, south: -1, west: -1 }, 1),
    ).toEqual([
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 1, z: 1 },
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 1, z: 1 },
    ]);
  });

  it('splits bounds that cross the antimeridian', () => {
    expect(
      enumerateOfflineMapTiles(
        { east: -170, north: 10, south: -10, west: 170 },
        2,
      ).map(({ x }) => x),
    ).toEqual([3, 3, 0, 0]);
  });

  it('adds a bounded render buffer for MapLibre tile prefetch', () => {
    expect(
      enumerateOfflineMapTiles(
        { east: -3.18, north: 55.96, south: 55.95, west: -3.2 },
        13,
        1,
      ),
    ).toHaveLength(9);
  });
});

describe('planOfflineMapTiles', () => {
  const bounds = { east: -3.18, north: 55.96, south: 55.95, west: -3.2 };

  it('deduplicates shared style resources and includes vectors, raster, sprites, and Latin/Armenian glyphs', () => {
    const plan = planOfflineMapTiles(bounds, {
      ...metadata,
      styles: {
        dark: { ...metadata.styles.dark, style },
        liberty: metadata.styles.liberty,
      },
    });
    const urls = plan.resources.map((item) => item.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain(
      'https://tiles.openfreemap.org/planet/20260304_001001_pt/14/8046/5105.pbf',
    );
    expect(urls.some((url) => url.includes('/natural_earth/ne2sr/6/'))).toBe(
      true,
    );
    expect(urls).toContain(
      'https://tiles.openfreemap.org/sprites/ofm_f384/ofm@2x.png',
    );
    expect(urls).toContain(
      'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf',
    );
    expect(urls).toContain(
      'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/1280-1535.pbf',
    );
  });

  it('has deterministic conservative estimates', () => {
    const first = planOfflineMapTiles(bounds, metadata);
    const second = planOfflineMapTiles(bounds, metadata);
    expect(second).toEqual(first);
    expect(first.estimatedBytes).toBeGreaterThan(first.resources.length * 1024);
    expect(first.datasets).toEqual([
      { id: 'basemap', refreshedAt: metadata.refreshedAt },
    ]);
  });

  it('identifies broad selections that exceed the per-area budget', () => {
    const plan = planOfflineMapTiles(
      { east: -2.8, north: 56.2, south: 55.7, west: -3.6 },
      metadata,
    );
    expect(plan.estimatedBytes).toBeGreaterThan(maximumOfflineAreaBytes);
  });
});

describe('OpenFreeMap URL safety', () => {
  it('only accepts the HTTPS tile host and refuses unsafe templates', () => {
    expect(isAllowedOfflineMapUrl('https://tiles.openfreemap.org/planet')).toBe(
      true,
    );
    expect(isAllowedOfflineMapUrl('http://tiles.openfreemap.org/planet')).toBe(
      false,
    );
    expect(isAllowedOfflineMapUrl('https://evil.example/planet')).toBe(false);
    expect(() =>
      planOfflineMapTiles(
        { east: 1, north: 1, south: 0, west: 0 },
        {
          ...metadata,
          tileJson: {
            ...metadata.tileJson,
            data: { tiles: ['https://evil.example/{z}/{x}/{y}.pbf'] },
          },
        },
      ),
    ).toThrow('Unsafe OpenFreeMap tile template URL.');
  });

  it('can fetch production-shaped metadata through an injected fetcher', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/planet'))
        return new Response(JSON.stringify(metadata.tileJson.data));
      return new Response(JSON.stringify(style));
    });
    await expect(
      fetchOfflineMapMetadata({
        fetcher,
        now: () => new Date(metadata.refreshedAt),
      }),
    ).resolves.toMatchObject({
      refreshedAt: '2026-03-04T00:00:00.000Z',
      tileJson: { url: 'https://tiles.openfreemap.org/planet' },
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
