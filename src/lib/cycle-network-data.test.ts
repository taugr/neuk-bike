import { describe, expect, it, vi } from 'vitest';
import {
  CycleNetworkDataClient,
  getCycleNetworkDataBaseUrl,
  type CycleNetworkFeature,
  type CycleNetworkManifest,
} from '@/lib/cycle-network-data';
import { toParkingTile } from '@/lib/parking-data';

const edinburghBounds = {
  east: -3.17,
  north: 55.97,
  south: 55.94,
  west: -3.23,
};
const tile = toParkingTile({ latitude: 55.955, longitude: -3.2 }, 10);
const key = `10/${tile.x}/${tile.y}`;
const feature: CycleNetworkFeature = {
  geometry: {
    coordinates: [
      [-3.2, 55.95],
      [-3.19, 55.96],
    ],
    type: 'LineString',
  },
  id: 'ncn:test',
  properties: {
    greenway: true,
    kind: 'traffic-free',
    openStatus: 'open',
    routeNumber: 1,
    routeType: 'ncn',
    segmentId: 1,
  },
  type: 'Feature',
};
const manifest: CycleNetworkManifest = {
  chunkZoom: 10,
  chunks: {
    [key]: {
      bounds: edinburghBounds,
      count: 1,
      path: 'chunks/test.json',
    },
  },
  coverage: {
    bounds: { east: 2, north: 59, south: 50, west: -8 },
    label: 'United Kingdom',
  },
  recordCount: 1,
  refreshedAt: '2026-07-26T00:00:00.000Z',
  schemaVersion: 2,
  source: {
    attribution: 'Official network attribution',
    dataEditedAt: '2026-07-26T00:00:00.000Z',
    itemUrl: 'https://example.com/item',
    label: 'National Cycle Network',
    licenceName: 'OGL v3.0',
    licenceUrl: 'https://example.com/licence',
    publisher: 'Walk Wheel Cycle Trust',
  },
};

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}

describe('CycleNetworkDataClient', () => {
  it('resolves its static data URL under the current app path', () => {
    expect(
      getCycleNetworkDataBaseUrl('https://example.com/neuk-bike/?mockGps=1')
        .href,
    ).toBe('https://example.com/neuk-bike/data/cycle-network/');
  });

  it('loads and deduplicates viewport features at the display threshold', async () => {
    const fetcher = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      return Promise.resolve(
        url.endsWith('manifest.json')
          ? jsonResponse(manifest)
          : jsonResponse({
              features: [feature, feature],
              key,
              schemaVersion: 2,
            }),
      );
    });
    const client = new CycleNetworkDataClient(
      new URL('https://example.com/data/cycle-network/'),
      fetcher,
    );

    const result = await client.loadBounds(edinburghBounds, 10);

    expect(result).toMatchObject({ available: true, visible: true });
    expect(result.features).toEqual([feature]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not request chunks below zoom 10 or outside UK coverage', async () => {
    const fetcher = vi.fn(() => Promise.resolve(jsonResponse(manifest)));
    const client = new CycleNetworkDataClient(
      new URL('https://example.com/data/cycle-network/'),
      fetcher,
    );

    await expect(client.loadBounds(edinburghBounds, 9)).resolves.toMatchObject({
      available: true,
      features: [],
      visible: false,
    });
    await expect(
      client.loadBounds(
        { east: -6.2, north: 53.5, south: 53.2, west: -6.5 },
        13,
      ),
    ).resolves.toMatchObject({
      available: false,
      features: [],
      visible: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reports availability without downloading chunks for a hidden layer', async () => {
    const fetcher = vi.fn(() => Promise.resolve(jsonResponse(manifest)));
    const client = new CycleNetworkDataClient(
      new URL('https://example.com/data/cycle-network/'),
      fetcher,
    );

    await expect(
      client.loadBounds(edinburghBounds, 13, { loadFeatures: false }),
    ).resolves.toEqual({
      available: true,
      features: [],
      visible: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
