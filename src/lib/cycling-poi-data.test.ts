import { describe, expect, it, vi } from 'vitest';
import {
  CyclingPoiDataClient,
  getCyclingPoiDataBaseUrl,
} from '@/lib/cycling-poi-data';
import type { CyclingPoiDataManifest, CyclingPoiPoint } from '@/lib/types';

const key = '12/2011/1275';
const point: CyclingPoiPoint = {
  categories: ['shop', 'repair'],
  id: 'osm:node:1',
  latitude: 55.9533,
  longitude: -3.1883,
  name: 'Waverley Cycles',
  properties: { openingHours: 'Mo-Fr 09:00-17:00' },
  sourceId: 'osm',
};
const manifest: CyclingPoiDataManifest = {
  categoryCounts: { hire: 0, repair: 1, shop: 1 },
  chunkZoom: 12,
  chunks: {
    [key]: {
      bounds: { east: -3.16, north: 55.97, south: 55.94, west: -3.25 },
      count: 1,
      path: `chunks/${key}.json`,
    },
  },
  coverage: { areas: [], label: 'UK, Ireland and Spain' },
  pointIndexPath: 'indexes/point-index.json',
  recordCount: 1,
  refreshedAt: '2026-07-23T00:00:00.000Z',
  schemaVersion: 2,
  sources: [],
};

describe('CyclingPoiDataClient', () => {
  it('resolves saved places through the point index and reports stale IDs', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(input.toString()).pathname;
      if (path.endsWith('/manifest.json')) return Response.json(manifest);
      if (path.endsWith('/point-index.json')) {
        return Response.json({ [point.id]: key });
      }
      if (path.endsWith(`/${key}.json`)) {
        return Response.json({ key, points: [point], schemaVersion: 2 });
      }
      return new Response(null, { status: 404 });
    });
    const client = new CyclingPoiDataClient(
      new URL('https://example.test/data/cycling-pois/'),
      fetcher,
    );

    await expect(
      client.loadPoints([point.id, 'osm:node:missing']),
    ).resolves.toEqual({
      failedIds: [],
      missingIds: ['osm:node:missing'],
      points: [point],
    });
    await expect(client.loadPoint(point.id)).resolves.toEqual(point);
    expect(fetcher).toHaveBeenCalledWith(
      new URL('https://example.test/data/cycling-pois/manifest.json'),
      { cache: 'no-cache' },
    );
    expect(
      fetcher.mock.calls.filter(([input]) =>
        new URL(input.toString()).pathname.endsWith(`/${key}.json`),
      ),
    ).toHaveLength(1);
  });

  it('resolves the data root beneath an app subpath', () => {
    expect(
      getCyclingPoiDataBaseUrl(
        'https://example.test/neuk-bike/?parking=osm:node:1',
      ).toString(),
    ).toBe('https://example.test/neuk-bike/data/cycling-pois/');
  });
});
