import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryOfflineAreaStore,
  downloadOfflineArea,
  estimateMissingOfflineAreaBytes,
  getOfflineAreaFreshness,
  listCompletedOfflineAreas,
  mergeOfflineAreaPlans,
  planOfflineArea,
  removeOfflineArea,
  type OfflineAreaCache,
  type OfflineAreaPlan,
  type OfflineAreaRecord,
} from '@/lib/offline-areas';

function createCache(): OfflineAreaCache & { entries: Map<string, Response> } {
  const entries = new Map<string, Response>();
  return {
    delete: async (request) => entries.delete(String(request)),
    entries,
    match: async (request) => entries.get(String(request)),
    put: async (request, response) =>
      void entries.set(String(request), response),
  };
}

const manifest = {
  chunks: {
    '12/1/1': { byteLength: 321, count: 1, path: 'chunks/12/1/1.json' },
    '12/1/2': { count: 3, path: 'chunks/12/1/2.json' },
  },
  pointIndexPath: 'indexes/points.json',
  refreshedAt: '2026-08-17T00:00:00.000Z',
};

function completeRecord(id: string, resourceUrls: string[]): OfflineAreaRecord {
  return {
    createdAt: '2026-08-17T00:00:00.000Z',
    estimatedBytes: 1,
    id,
    manifestRefreshedAt: manifest.refreshedAt,
    name: id,
    resourceUrls,
    status: 'complete',
    updatedAt: '2026-08-17T00:00:00.000Z',
  };
}

describe('planOfflineArea', () => {
  it('plans manifest snapshots, point indexes, selected chunks, and safe byte fallbacks', () => {
    const manifestByteLength = new TextEncoder().encode(
      JSON.stringify(manifest),
    ).length;
    const plan = planOfflineArea(
      'https://neuk.bike/data/parking/manifest.json',
      manifest,
      ['12/1/1', 'missing', '12/1/2'],
      { datasetId: 'parking', includePointIndex: true },
    );

    expect(plan.resources).toEqual([
      {
        byteLength: manifestByteLength,
        key: 'parking:manifest',
        url: 'https://neuk.bike/data/parking/manifest.json',
      },
      {
        byteLength: 1024,
        key: 'parking:point-index',
        url: 'https://neuk.bike/data/parking/indexes/points.json',
      },
      {
        byteLength: 321,
        key: 'parking:12/1/1',
        url: 'https://neuk.bike/data/parking/chunks/12/1/1.json',
      },
      {
        byteLength: 1200,
        key: 'parking:12/1/2',
        url: 'https://neuk.bike/data/parking/chunks/12/1/2.json',
      },
    ]);
    expect(plan.estimatedBytes).toBe(manifestByteLength + 1024 + 321 + 1200);
    expect(plan.datasets).toEqual([
      { id: 'parking', refreshedAt: manifest.refreshedAt },
    ]);
  });

  it('plans cycle-network chunks without a point index by default', () => {
    const networkPlan = planOfflineArea(
      'https://neuk.bike/data/cycle-network/manifest.json',
      {
        chunks: {
          '9/1/1': { byteLength: 500, count: 1, path: 'chunks/9/1/1.json' },
        },
        refreshedAt: '2026-08-16T00:00:00.000Z',
      },
      ['9/1/1'],
      { datasetId: 'cycle-network' },
    );

    expect(networkPlan.resources).toHaveLength(2);
    expect(networkPlan.resources.map((resource) => resource.key)).toEqual([
      'cycle-network:manifest',
      'cycle-network:9/1/1',
    ]);
  });

  it('merges plans with de-duplicated resources and per-dataset dates', () => {
    const parkingPlan = planOfflineArea(
      'https://neuk.bike/data/parking/manifest.json',
      manifest,
      ['12/1/1'],
      { datasetId: 'parking' },
    );
    const networkPlan = planOfflineArea(
      'https://neuk.bike/data/cycle-network/manifest.json',
      {
        chunks: {
          '9/1/1': { byteLength: 500, count: 1, path: 'chunks/9/1/1.json' },
        },
        refreshedAt: '2026-08-16T00:00:00.000Z',
      },
      ['9/1/1'],
      { datasetId: 'cycle-network' },
    );

    const merged = mergeOfflineAreaPlans([parkingPlan, networkPlan]);
    expect(merged.resources).toHaveLength(4);
    expect(merged.datasets).toEqual([
      { id: 'cycle-network', refreshedAt: '2026-08-16T00:00:00.000Z' },
      { id: 'parking', refreshedAt: manifest.refreshedAt },
    ]);
  });
});

describe('downloadOfflineArea', () => {
  const plan: OfflineAreaPlan = {
    datasets: [{ id: 'parking', refreshedAt: manifest.refreshedAt }],
    estimatedBytes: 3,
    manifestRefreshedAt: manifest.refreshedAt,
    resources: [
      { byteLength: 1, key: 'a', url: 'https://neuk.bike/data/a.json' },
      { byteLength: 2, key: 'b', url: 'https://neuk.bike/data/b.json' },
    ],
  };

  it('only marks an area complete after every resource is cached, then resumes partial work', async () => {
    const cache = createCache();
    const store = createMemoryOfflineAreaStore();
    const controller = new AbortController();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('a.json')) controller.abort();
      return new Response('{}');
    });

    await expect(
      downloadOfflineArea('edinburgh', 'Edinburgh', plan, {
        cache,
        concurrency: 1,
        fetcher,
        signal: controller.signal,
        store,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect((await store.get('edinburgh'))?.status).toBe('downloading');
    expect(cache.entries.size).toBe(0);

    const result = await downloadOfflineArea('edinburgh', 'Edinburgh', plan, {
      cache,
      concurrency: 1,
      fetcher: async () => new Response('{}'),
      store,
    });
    expect(result.record.status).toBe('complete');
    expect(cache.entries.size).toBe(2);

    const resumed = await downloadOfflineArea('edinburgh', 'Edinburgh', plan, {
      cache,
      fetcher: async () => {
        throw new Error('already cached resources should not fetch');
      },
      store,
    });
    expect(resumed.resumed).toBe(true);
  });

  it('persists view metadata and dataset summaries with completed records', async () => {
    const cache = createCache();
    const store = createMemoryOfflineAreaStore();
    const result = await downloadOfflineArea('yerevan', 'Yerevan', plan, {
      cache,
      fetcher: async () => new Response('{}'),
      metadata: {
        bounds: { east: 44.6, north: 40.22, south: 40.13, west: 44.42 },
        center: { latitude: 40.177, longitude: 44.51 },
        datasets: [
          { id: 'parking', refreshedAt: '2026-08-17T00:00:00.000Z' },
          { id: 'cycle-network', refreshedAt: '2026-08-16T00:00:00.000Z' },
        ],
      },
      store,
    });

    expect(result.record.status).toBe('complete');
    expect(await store.get('yerevan')).toMatchObject({
      bounds: { east: 44.6, north: 40.22, south: 40.13, west: 44.42 },
      center: { latitude: 40.177, longitude: 44.51 },
      datasets: [
        { id: 'cycle-network', refreshedAt: '2026-08-16T00:00:00.000Z' },
        { id: 'parking', refreshedAt: '2026-08-17T00:00:00.000Z' },
      ],
    });
  });

  it('keeps a completed record usable when its update fails', async () => {
    const cache = createCache();
    const previous = completeRecord('edinburgh', [
      'https://neuk.bike/data/previous.json',
    ]);
    const store = createMemoryOfflineAreaStore([previous]);

    await expect(
      downloadOfflineArea('edinburgh', 'Edinburgh', plan, {
        cache,
        fetcher: async () => new Response('', { status: 404 }),
        store,
      }),
    ).rejects.toThrow('Offline resource request failed (404)');
    await expect(store.get('edinburgh')).resolves.toEqual(previous);
  });

  it('retries transient responses and records response byte lengths', async () => {
    const cache = createCache();
    const store = createMemoryOfflineAreaStore();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValue(
        new Response('{}', { headers: { 'content-length': '7' } }),
      );

    const result = await downloadOfflineArea('retry', 'Retry', plan, {
      cache,
      fetcher,
      minimumRequestIntervalMs: 0,
      store,
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.record.actualBytes).toBe(14);
  });
});

describe('offline storage guidance', () => {
  it('counts only resources that are not already cached', async () => {
    const cache = createCache();
    await cache.put('https://neuk.bike/data/a.json', new Response('{}'));
    const plan: OfflineAreaPlan = {
      datasets: [],
      estimatedBytes: 30,
      manifestRefreshedAt: '',
      resources: [
        { byteLength: 10, key: 'a', url: 'https://neuk.bike/data/a.json' },
        { byteLength: 20, key: 'b', url: 'https://neuk.bike/data/b.json' },
      ],
    };

    await expect(estimateMissingOfflineAreaBytes(plan, cache)).resolves.toBe(
      20,
    );
  });

  it('recommends updates after 30 days and warns after 90 days', () => {
    const currentTime = new Date('2026-08-20T00:00:00.000Z').getTime();
    expect(
      getOfflineAreaFreshness(
        { updatedAt: '2026-08-01T00:00:00.000Z' },
        currentTime,
      ),
    ).toBe('fresh');
    expect(
      getOfflineAreaFreshness(
        { updatedAt: '2026-07-01T00:00:00.000Z' },
        currentTime,
      ),
    ).toBe('update-recommended');
    expect(
      getOfflineAreaFreshness(
        { updatedAt: '2026-05-01T00:00:00.000Z' },
        currentTime,
      ),
    ).toBe('stale');
  });
});

describe('removeOfflineArea', () => {
  it('retains resources shared by overlapping saved areas', async () => {
    const shared = 'https://neuk.bike/data/shared.json';
    const onlyFirst = 'https://neuk.bike/data/first.json';
    const onlySecond = 'https://neuk.bike/data/second.json';
    const cache = createCache();
    for (const url of [shared, onlyFirst, onlySecond]) {
      await cache.put(url, new Response('{}'));
    }
    const store = createMemoryOfflineAreaStore([
      completeRecord('first', [shared, onlyFirst]),
      completeRecord('second', [shared, onlySecond]),
    ]);

    await expect(removeOfflineArea('first', { cache, store })).resolves.toBe(
      true,
    );
    expect(cache.entries.has(shared)).toBe(true);
    expect(cache.entries.has(onlyFirst)).toBe(false);
    expect(cache.entries.has(onlySecond)).toBe(true);
  });
});

describe('offline area record compatibility', () => {
  it('keeps existing completed records without view metadata readable', async () => {
    const legacy = completeRecord('legacy', [
      'https://neuk.bike/data/legacy.json',
    ]);
    const store = createMemoryOfflineAreaStore([legacy]);

    await expect(listCompletedOfflineAreas(store)).resolves.toEqual([legacy]);
  });
});
