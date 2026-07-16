import { describe, expect, it, vi } from 'vitest';
import {
  getParkingDataBaseUrl,
  getParkingTileKeysAroundLocation,
  getParkingTileKeysForBounds,
  isLocationInParkingCoverage,
  ParkingDataClient,
  toParkingTile,
} from '@/lib/parking-data';
import type { ParkingDataManifest, ParkingPoint } from '@/lib/types';

const edinburgh = { latitude: 55.9533, longitude: -3.1883 };
const tile = toParkingTile(edinburgh, 10);
const centerKey = `10/${tile.x}/${tile.y}`;
const eastKey = `10/${tile.x + 1}/${tile.y}`;
const manifest: ParkingDataManifest = {
  chunkZoom: 10,
  chunks: {
    [centerKey]: {
      bounds: { east: -3, north: 56, south: 55.9, west: -3.3 },
      count: 1,
      path: `version/${centerKey}.json`,
    },
    [eastKey]: {
      bounds: { east: -2.7, north: 56, south: 55.9, west: -3 },
      count: 1,
      path: `version/${eastKey}.json`,
    },
  },
  coverage: {
    areas: [
      {
        bounds: { east: -0.5, north: 60.9, south: 54.55, west: -8.7 },
        id: 'scotland',
        label: 'Scotland',
        rings: [
          {
            coordinates: [
              [-8.7, 54.55],
              [-0.5, 54.55],
              [-0.5, 60.9],
              [-8.7, 60.9],
            ],
            exclude: false,
          },
        ],
      },
      {
        bounds: { east: 2, north: 56, south: 49.8, west: -6 },
        id: 'england',
        label: 'England',
        rings: [
          {
            coordinates: [
              [-6, 49.8],
              [2, 49.8],
              [2, 56],
              [-6, 56],
            ],
            exclude: false,
          },
          {
            coordinates: [
              [-5.5, 51],
              [-2.5, 51],
              [-2.5, 53.5],
              [-5.5, 53.5],
            ],
            exclude: true,
          },
        ],
      },
      {
        bounds: { east: -2.5, north: 53.5, south: 51.3, west: -5.5 },
        id: 'wales',
        label: 'Wales',
        rings: [
          {
            coordinates: [
              [-5.5, 51.3],
              [-2.5, 51.3],
              [-2.5, 53.5],
              [-5.5, 53.5],
            ],
            exclude: false,
          },
        ],
      },
      {
        bounds: { east: -5.3, north: 55.5, south: 51.3, west: -10.8 },
        id: 'ireland-and-northern-ireland',
        label: 'Ireland and Northern Ireland',
        rings: [
          {
            coordinates: [
              [-10.8, 51.3],
              [-5.3, 51.3],
              [-5.3, 55.5],
              [-10.8, 55.5],
            ],
            exclude: false,
          },
        ],
      },
    ],
    label: 'UK and Ireland',
  },
  pointIndexPath: 'version/point-index.json',
  recordCount: 2,
  refreshedAt: '2026-07-15T00:00:00.000Z',
  schemaVersion: 2,
  sources: [],
};
const centerPoint: ParkingPoint = {
  id: 'cec:1',
  latitude: edinburgh.latitude,
  longitude: edinburgh.longitude,
  name: 'Cycle parking 1',
  properties: {},
  sourceId: 'cec',
};

describe('parking data tiling', () => {
  it('builds stable tile coordinates and nearby keys', () => {
    expect(toParkingTile(edinburgh, 10)).toEqual(tile);
    expect(getParkingTileKeysAroundLocation(edinburgh, manifest)).toEqual(
      expect.arrayContaining([centerKey, eastKey]),
    );
  });

  it('selects viewport chunks and respects regional coverage polygons', () => {
    expect(
      getParkingTileKeysForBounds(
        { east: -3.05, north: 55.99, south: 55.91, west: -3.25 },
        manifest,
      ),
    ).toContain(centerKey);
    expect(isLocationInParkingCoverage(edinburgh, manifest)).toBe(true);
    expect(
      isLocationInParkingCoverage(
        { latitude: 51.5072, longitude: -0.1276 },
        manifest,
      ),
    ).toBe(true);
    expect(
      isLocationInParkingCoverage(
        { latitude: 51.4816, longitude: -3.1791 },
        manifest,
      ),
    ).toBe(true);
    expect(
      isLocationInParkingCoverage(
        { latitude: 53.3498, longitude: -6.2603 },
        manifest,
      ),
    ).toBe(true);
    expect(
      isLocationInParkingCoverage(
        { latitude: 49.2144, longitude: -2.1313 },
        manifest,
      ),
    ).toBe(false);
  });

  it('resolves the data root relative to a root or subpath app', () => {
    expect(getParkingDataBaseUrl('https://neuk.bike/').toString()).toBe(
      'https://neuk.bike/data/parking/',
    );
    expect(
      getParkingDataBaseUrl(
        'https://example.test/neuk-bike/?parking=cec:1',
      ).toString(),
    ).toBe('https://example.test/neuk-bike/data/parking/');
  });
});

describe('ParkingDataClient', () => {
  it('loads nearby chunks once and resolves an indexed point', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(input.toString()).pathname;
      if (path.endsWith('/manifest.json')) {
        return Response.json(manifest);
      }
      if (path.endsWith('/point-index.json')) {
        return Response.json({ 'cec:1': centerKey });
      }
      if (path.endsWith(`/${centerKey}.json`)) {
        return Response.json({
          key: centerKey,
          points: [centerPoint],
          schemaVersion: 2,
        });
      }
      if (path.endsWith(`/${eastKey}.json`)) {
        return Response.json({ key: eastKey, points: [], schemaVersion: 2 });
      }
      return new Response(null, { status: 404 });
    });
    const client = new ParkingDataClient(
      new URL('https://example.test/data/parking/'),
      fetcher,
    );

    await client.loadLocation(edinburgh);
    await client.loadLocation(edinburgh);
    expect(client.getLoadedPoints()).toEqual([centerPoint]);
    expect(await client.loadPoint('cec:1')).toEqual(centerPoint);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('retries failed chunks and evicts the least recently used chunk', async () => {
    const westKey = `10/${tile.x - 1}/${tile.y}`;
    const threeChunkManifest: ParkingDataManifest = {
      ...manifest,
      chunks: {
        ...manifest.chunks,
        [westKey]: {
          bounds: { east: -3.3, north: 56, south: 55.9, west: -3.6 },
          count: 1,
          path: `version/${westKey}.json`,
        },
      },
      recordCount: 3,
    };
    const eastPoint: ParkingPoint = {
      ...centerPoint,
      id: 'osm:node:2',
      sourceId: 'osm',
    };
    const westPoint: ParkingPoint = {
      ...centerPoint,
      id: 'osm:node:3',
      sourceId: 'osm',
    };
    let failWestChunk = true;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(input.toString()).pathname;
      if (path.endsWith('/manifest.json')) {
        return Response.json(threeChunkManifest);
      }
      if (path.endsWith('/point-index.json')) {
        return Response.json({
          'cec:1': centerKey,
          'osm:node:2': eastKey,
          'osm:node:3': westKey,
        });
      }
      if (path.endsWith(`/${centerKey}.json`)) {
        return Response.json({
          key: centerKey,
          points: [centerPoint],
          schemaVersion: 2,
        });
      }
      if (path.endsWith(`/${eastKey}.json`)) {
        return Response.json({
          key: eastKey,
          points: [eastPoint],
          schemaVersion: 2,
        });
      }
      if (path.endsWith(`/${westKey}.json`)) {
        if (failWestChunk) {
          failWestChunk = false;
          return new Response(null, { status: 503 });
        }
        return Response.json({
          key: westKey,
          points: [westPoint],
          schemaVersion: 2,
        });
      }
      return new Response(null, { status: 404 });
    });
    const client = new ParkingDataClient(
      new URL('https://example.test/data/parking/'),
      fetcher,
      2,
    );

    await client.loadPoint('cec:1');
    await client.loadPoint('osm:node:2');
    await client.loadPoint('cec:1');
    await expect(client.loadPoint('osm:node:3')).rejects.toThrow(
      'request failed (503)',
    );
    await expect(client.loadPoint('osm:node:3')).resolves.toEqual(westPoint);

    expect(client.getLoadedChunkKeys()).toEqual([centerKey, westKey]);
    expect(client.getLoadedPoints()).toEqual([centerPoint, westPoint]);
  });
});
