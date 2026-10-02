import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  mkdir,
  stat,
  cp,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createOSMStream } from 'osm-pbf-parser-node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkDataFreshness } from '../../scripts/check-data-freshness.mjs';
import {
  assertFreshOsmRelease,
  promoteStagedPaths,
  summarizeSourceDates,
} from '../../scripts/data-release-utils.mjs';
import {
  downloadGeofabrikExtract,
  parsePublication,
  resolveGeofabrikExtract,
  validatePbfFile,
} from '../../scripts/geofabrik-download.mjs';

import {
  createPublicationPlan,
  openPublicationPlan,
  planDigest,
  validatePublicationPlan,
} from '../../scripts/publication-plan.mjs';
import { osmInputs } from '../../scripts/parking-data-sources.mjs';

const latest =
  'https://download.geofabrik.de/europe/united-kingdom/england/berkshire-latest.osm.pbf';
const dated = latest.replace('latest', '260930');
const page = latest.replace('-latest.osm.pbf', '.html');
const timestamp = '2026-09-30T20:22:42.000Z';
const now = Date.parse('2026-10-01T12:00:00Z');
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function varint(value: number | bigint) {
  let remaining = BigInt(value);
  const bytes = [];
  while (remaining >= 128n) {
    bytes.push(Number(remaining & 127n) | 128);
    remaining >>= 7n;
  }
  bytes.push(Number(remaining));
  return Buffer.from(bytes);
}
function field(id: number, bytes: Buffer | string) {
  const data = Buffer.from(bytes);
  return Buffer.concat([varint(id * 8 + 2), varint(data.length), data]);
}
function integer(id: number, value: number) {
  return Buffer.concat([varint(id * 8), varint(value)]);
}
function block(type: string, data: Buffer, compressed = false) {
  const blob = compressed
    ? Buffer.concat([integer(2, data.length), field(3, deflateSync(data))])
    : field(1, data);
  const header = Buffer.concat([field(1, type), integer(3, blob.length)]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  return Buffer.concat([length, header, blob]);
}
function pbf(sourceTimestamp = timestamp) {
  const header = Buffer.concat([
    field(4, 'OsmSchema-V0.6'),
    integer(32, Date.parse(sourceTimestamp) / 1_000),
  ]);
  const strings = Buffer.concat(
    [
      '',
      'amenity',
      'bicycle_parking',
      'name',
      'Fixture parking',
      'shop',
      'bicycle',
    ].map((text) => field(1, text)),
  );
  const node = Buffer.concat([
    integer(1, 2),
    field(2, Buffer.from([1, 3, 5])),
    field(3, Buffer.from([2, 4, 6])),
    integer(8, 559533000 * 2),
    integer(9, 31883000 * 2 - 1),
  ]);
  const data = Buffer.concat([field(1, strings), field(2, field(1, node))]);
  return Buffer.concat([
    block('OSMHeader', header),
    block('OSMData', data, true),
  ]);
}
const body = pbf();
function html(bytes = body.length, cutoff = timestamp.slice(0, 19) + 'Z') {
  return `<li><a href="berkshire-latest.osm.pbf">berkshire-latest.osm.pbf</a>, contains all OSM data up to ${cutoff}. File size: 21.5 MB.</li>
    <tr><td><a href="berkshire-260930.osm.pbf">berkshire-260930.osm.pbf</a></td><td>2026-10-01 02:01</td><td>${bytes}</td></tr>`;
}

type Handler = (
  url: string,
  init: RequestInit,
) => Response | Promise<Response> | undefined;
function upstream(handler?: Handler, publication = html()) {
  return vi.fn(
    async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      const override = await handler?.(url, init);
      if (override) return override;
      if (url === page)
        return new Response(publication, {
          headers: { 'content-type': 'text/html' },
        });
      if (url !== latest && url !== dated)
        throw new Error(`Unexpected request: ${url}`);
      const headers: Record<string, string> = {
        'content-type': 'application/octet-stream',
        'content-length': String(body.length),
        'last-modified': 'Thu, 01 Oct 2026 02:01:12 GMT',
      };
      if (init.method === 'HEAD') return new Response(null, { headers });
      if ((init.headers as Record<string, string>)?.Range) {
        headers['content-range'] = `bytes 0-${body.length - 1}/${body.length}`;
        return new Response(new Uint8Array(body), { status: 206, headers });
      }
      return new Response(new Uint8Array(body), { headers });
    },
  );
}
const options = (fetcher: typeof fetch) => ({
  fetcher,
  now,
  log: vi.fn(),
  sleep: async () => {},
});
async function output() {
  const root = await mkdtemp(join(tmpdir(), 'neuk-geofabrik-'));
  temporary.push(root);
  return join(root, 'extract.pbf');
}

describe('official Geofabrik resolution', () => {
  it('reads only 64 KiB when the probe ends inside a larger PBF block', async () => {
    const large = Buffer.concat([
      body,
      block(
        'OSMData',
        field(1, field(1, randomBytes(90_000).toString('hex'))),
        true,
      ),
    ]);
    expect(large.length).toBeGreaterThan(65_536);
    const fetcher = upstream((url, init) => {
      if (url === latest) return new Response(null, { status: 404 });
      if (url !== dated) return;
      const headers = {
        'content-type': 'application/octet-stream',
        'content-length': String(large.length),
        'content-range': `bytes 0-65535/${large.length}`,
      };
      if (init.method === 'HEAD') return new Response(null, { headers });
      expect((init.headers as Record<string, string>).Range).toBe(
        'bytes=0-65535',
      );
      return new Response(new Uint8Array(large.subarray(0, 65_536)), {
        status: 206,
        headers,
      });
    }, html(large.length));
    expect(
      await resolveGeofabrikExtract(latest, options(fetcher)),
    ).toMatchObject({ sourceTimestamp: timestamp, bytes: large.length });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('keeps a healthy latest URL and verifies the actual PBF cutoff', async () => {
    const fetcher = upstream();
    expect(
      await resolveGeofabrikExtract(latest, options(fetcher)),
    ).toMatchObject({
      downloadUrl: latest,
      sourceTimestamp: timestamp,
      bytes: body.length,
      fallback: false,
    });
    expect(
      fetcher.mock.calls.some(([, init]) => init?.redirect !== 'manual'),
    ).toBe(false);
  });

  it.each(['404', 'malformed', 'loop', 'GET failure'])(
    'falls back to the current dated publication after %s',
    async (failure) => {
      const fetcher = upstream((url, init) => {
        if (url !== latest) return;
        if (failure === '404') return new Response(null, { status: 404 });
        if (failure === 'malformed')
          return new Response(null, {
            status: 301,
            headers: { location: latest + '/' },
          });
        if (failure === 'loop')
          return new Response(null, {
            status: 302,
            headers: { location: latest },
          });
        if (init.method !== 'HEAD') return new Response(null, { status: 404 });
      });
      const settings = options(fetcher);
      expect(await resolveGeofabrikExtract(latest, settings)).toMatchObject({
        downloadUrl: dated,
        fallback: true,
        sourceTimestamp: timestamp,
      });
      expect(settings.log).toHaveBeenCalledWith(
        expect.stringContaining('latest failed'),
      );
      expect(
        fetcher.mock.calls.some(([url]) => String(url).endsWith('.pbf/')),
      ).toBe(false);
    },
  );

  it('allows a same-region redirect to the validated dated file', async () => {
    const fetcher = upstream((url) =>
      url === latest
        ? new Response(null, { status: 302, headers: { location: dated } })
        : undefined,
    );
    expect(
      await resolveGeofabrikExtract(latest, options(fetcher)),
    ).toHaveProperty('downloadUrl', dated);
  });

  it.each([
    ['stale', html().replace('2026-09-30T20:22:42Z', '2026-07-30T20:22:42Z')],
    ['missing', html().replace(/<tr>[\s\S]*$/, '')],
    [
      'foreign host',
      html().replace(
        'href="berkshire-260930',
        'href="https://evil.example/berkshire-260930',
      ),
    ],
    [
      'different region',
      html().replaceAll('berkshire-260930', 'scotland-260930'),
    ],
    ['different date', html().replaceAll('260930', '260929')],
    [
      'future cutoff',
      html().replace('2026-09-30T20:22:42Z', '2026-10-02T20:22:42Z'),
    ],
    ['invalid size', html().replace(`<td>${body.length}</td>`, '<td>0</td>')],
    [
      'publication before data',
      html().replace('2026-10-01 02:01', '2026-09-29 02:01'),
    ],
  ])('rejects %s publication metadata', async (_label, publication) => {
    const fetcher = upstream(undefined, publication);
    await expect(
      resolveGeofabrikExtract(latest, options(fetcher)),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    'foreign',
    'size',
    'HTML',
    'timestamp',
    'range ignored',
    'range total',
    'truncated probe',
  ])('rejects a dated response with %s mismatch', async (failure) => {
    const fetcher = upstream((url, init) => {
      if (url === latest) return new Response(null, { status: 404 });
      if (url !== dated) return;
      if (failure === 'foreign')
        return new Response(null, {
          status: 301,
          headers: {
            location: 'https://evil.example/berkshire-260930.osm.pbf',
          },
        });
      const headers: Record<string, string> = {
        'content-type':
          failure === 'HTML' ? 'text/html' : 'application/octet-stream',
        'content-length': String(
          failure === 'size' ? body.length + 1 : body.length,
        ),
      };
      if (init.method === 'HEAD') return new Response(null, { headers });
      const bytes =
        failure === 'timestamp'
          ? pbf('2026-09-29T20:22:42Z')
          : failure === 'truncated probe'
            ? body.subarray(0, body.length - 1)
            : body;
      headers['content-range'] =
        `bytes 0-${body.length - 1}/${failure === 'range total' ? body.length + 1 : body.length}`;
      return new Response(new Uint8Array(bytes), {
        status: failure === 'range ignored' ? 200 : 206,
        headers,
      });
    });
    await expect(
      resolveGeofabrikExtract(latest, options(fetcher)),
    ).rejects.toThrow();
    expect(
      fetcher.mock.calls.some(([url]) => String(url).includes('evil.example')),
    ).toBe(false);
  });

  it('bounds transient retries and includes the nested error in logs', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('fetch failed', {
        cause: new Error('socket closed'),
      });
    });
    const settings = options(fetcher);
    await expect(resolveGeofabrikExtract(latest, settings)).rejects.toThrow(
      'fetch failed',
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(settings.log).toHaveBeenCalledWith(
      expect.stringContaining('socket closed'),
    );
  });

  it('retries a transient publication-page timeout before resolving the validated fallback', async () => {
    let timedOut = false;
    const fetcher = upstream((url) => {
      if (url === page && !timedOut) {
        timedOut = true;
        throw new DOMException(
          'The operation was aborted due to timeout',
          'TimeoutError',
        );
      }
      if (url === latest) return new Response(null, { status: 404 });
    });
    const settings = options(fetcher);
    expect(await resolveGeofabrikExtract(latest, settings)).toMatchObject({
      downloadUrl: dated,
      sourceTimestamp: timestamp,
    });
    expect(
      fetcher.mock.calls.filter(([url]) => String(url) === page),
    ).toHaveLength(2);
    expect(settings.log).toHaveBeenCalledWith(
      expect.stringContaining('timeout'),
    );
  });

  it('stops after three publication-page timeouts without probing unvalidated extracts', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe(page);
      throw new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError',
      );
    });
    await expect(
      resolveGeofabrikExtract(latest, options(fetcher)),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.every(([url]) => String(url) === page)).toBe(
      true,
    );
  });

  it('rejects foreign latest input before any network request', async () => {
    const fetcher = upstream();
    await expect(
      resolveGeofabrikExtract(
        latest.replace('download.geofabrik.de', 'evil.example'),
        options(fetcher),
      ),
    ).rejects.toThrow('Untrusted');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('validated download and release fixtures', () => {
  it('runs both real updaters from one complete plan after metadata becomes unavailable', async () => {
    const root = join(await output(), '..');
    await mkdir(join(root, 'src/data'), { recursive: true });
    const { plan } = await createPublicationPlan(
      'a'.repeat(40),
      options(upstream()),
      [{ id: 'berkshire', url: latest }],
    );
    plan.sources = osmInputs.map((input) => ({
      ...plan.sources[0],
      id: input.id,
      latestUrl: input.url,
      datedUrl: input.url.replace('latest', '260930'),
      downloadUrl: input.url.replace('latest', '260930'),
    }));
    const planPath = join(root, 'plan.json');
    await writeFile(planPath, JSON.stringify(plan));
    const preload = join(root, 'fixture-fetch.mjs');
    await writeFile(
      preload,
      `
      Date.now = () => ${now};
      const body = Buffer.from(${JSON.stringify(body.toString('base64'))}, 'base64');
      const latest = ${JSON.stringify(latest)};
      const dated = ${JSON.stringify(dated)};
      const page = ${JSON.stringify(page)};
      globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        if (url === page) throw new Error('Publication metadata now unavailable');
        if (url === latest) return new Response(null, { status: 301, headers: { location: latest + '/' } });
        if (url === dated) {
          const headers = { 'content-type': 'application/octet-stream', 'content-length': String(body.length) };
          if (init.method === 'HEAD') return new Response(null, { headers });
          if (init.headers?.Range) {
            headers['content-range'] = 'bytes 0-' + (body.length - 1) + '/' + body.length;
            return new Response(body, { status: 206, headers });
          }
          return new Response(body, { headers });
        }
        if (url.startsWith('https://download.geofabrik.de/') && url.endsWith('.poly'))
          return new Response('fixture\\n1\\n -180 -90\\n 180 -90\\n 180 90\\n -180 90\\n -180 -90\\nEND\\nEND\\n');
        if (url === 'https://services-eu1.arcgis.com/FgpikkYuSUOuITxp/arcgis/rest/services/Public_Bike_Parking/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson')
          return Response.json({ features: [] });
        throw new Error('Unexpected fixture request (no real network): ' + url);
      };
    `,
    );
    for (const script of [
      'update-cycle-parking-data.mjs',
      'update-cycling-poi-data.mjs',
    ]) {
      execFileSync(
        process.execPath,
        [
          '--import',
          preload,
          new URL('../../scripts/' + script, import.meta.url).pathname,
          '--regions=berkshire',
          ...(script === 'update-cycle-parking-data.mjs'
            ? ['--force-download']
            : []),
        ],
        {
          env: {
            ...process.env,
            NEUK_DATA_ROOT: root,
            NEUK_DATA_CACHE_ROOT: join(root, 'cache'),
            NEUK_PUBLICATION_PLAN: planPath,
            NEUK_PLAN_INVOCATION: plan.invocationId,
            NEUK_PLAN_REVISION: plan.codeRevision,
            NEUK_PLAN_DIGEST: planDigest(plan),
          },
          timeout: 15_000,
          stdio: 'pipe',
        },
      );
    }
    const parking = JSON.parse(
      await readFile(join(root, 'src/data/cycle-parking-report.json'), 'utf8'),
    );
    const pois = JSON.parse(
      await readFile(join(root, 'src/data/cycling-poi-report.json'), 'utf8'),
    );
    for (const input of [parking.osm.inputs[0], pois.inputs[0]])
      expect(input).toMatchObject({
        sourceUrl: latest,
        downloadUrl: dated,
        sourceTimestamp: timestamp,
        pbfSha256: createHash('sha256').update(body).digest('hex'),
        recordCount: 1,
        publicationPlanId: plan.invocationId,
      });
    expect(parking.mergedRecordCount).toBe(1);
    expect(pois.recordCount).toBe(1);
  });

  it('downloads, parses, dates and promotes a validated fixture', async () => {
    const path = await output();
    const fetcher = upstream((url) =>
      url === latest ? new Response(null, { status: 404 }) : undefined,
    );
    const source = await downloadGeofabrikExtract(
      { url: latest, outputPath: path, forceDownload: true },
      options(fetcher),
    );
    expect(await readFile(path)).toEqual(body);
    expect(source).toMatchObject({
      downloadUrl: dated,
      sha256: createHash('sha256').update(body).digest('hex'),
      cached: false,
    });
    const nodes = [];
    for await (const item of createOSMStream(path))
      if ('type' in item && item.type === 'node') nodes.push(item);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toHaveProperty('tags.amenity', 'bicycle_parking');
    const dataset = {
      id: 'parking',
      ...summarizeSourceDates(
        [{ id: 'berkshire', sourceTimestamp: source.sourceTimestamp }],
        ['berkshire'],
      ),
    };
    assertFreshOsmRelease([dataset], now);
    const root = join(path, '..');
    await mkdir(join(root, 'stage'));
    await mkdir(join(root, 'live'));
    await writeFile(join(root, 'stage', 'report'), JSON.stringify(dataset));
    await writeFile(join(root, 'live', 'report'), 'previous release');
    await promoteStagedPaths(join(root, 'stage'), join(root, 'live'), [
      'report',
    ]);
    expect(
      JSON.parse(await readFile(join(root, 'live', 'report'), 'utf8'))
        .oldestSourceAt,
    ).toBe(timestamp);
    expect(
      await readFile(join(root, 'stage', '.previous', 'report'), 'utf8'),
    ).toBe('previous release');
  });

  it('uses the dated fallback when HEAD/range work but the full latest GET fails', async () => {
    const path = await output();
    const fetcher = upstream((url, init) =>
      url === latest &&
      init.method !== 'HEAD' &&
      !(init.headers as Record<string, string>)?.Range
        ? new Response(null, { status: 404 })
        : undefined,
    );
    expect(
      await downloadGeofabrikExtract(
        { url: latest, outputPath: path },
        options(fetcher),
      ),
    ).toMatchObject({ downloadUrl: dated, fallback: true });
  });

  it('reports the actual dated URL when only the full GET redirects', async () => {
    const path = await output();
    const fetcher = upstream((url, init) =>
      url === latest &&
      init.method !== 'HEAD' &&
      !(init.headers as Record<string, string>)?.Range
        ? new Response(null, { status: 302, headers: { location: dated } })
        : undefined,
    );
    expect(
      await downloadGeofabrikExtract(
        { url: latest, outputPath: path },
        options(fetcher),
      ),
    ).toMatchObject({ downloadUrl: dated, fallback: true });
  });

  it.each(['truncated', 'HTML', 'bad framing', 'timestamp'])(
    'preserves existing cached data after a %s download',
    async (failure) => {
      const path = await output();
      await writeFile(path, 'previous cache');
      const fetcher = upstream((url, init) => {
        if (
          url === page ||
          init.method === 'HEAD' ||
          (init.headers as Record<string, string>)?.Range
        )
          return;
        const bytes =
          failure === 'truncated'
            ? body.subarray(0, -1)
            : failure === 'timestamp'
              ? pbf('2026-09-29T20:22:42Z')
              : failure === 'bad framing'
                ? Buffer.concat([
                    body.subarray(0, body.length - 2),
                    Buffer.from([0, 0]),
                  ])
                : Buffer.alloc(body.length, 32);
        return new Response(new Uint8Array(bytes), {
          headers: {
            'content-type':
              failure === 'HTML' ? 'text/html' : 'application/octet-stream',
            'content-length': String(body.length),
          },
        });
      });
      await expect(
        downloadGeofabrikExtract(
          { url: latest, outputPath: path, forceDownload: true },
          options(fetcher),
        ),
      ).rejects.toThrow();
      expect(await readFile(path, 'utf8')).toBe('previous cache');
      await expect(stat(path + '.download')).rejects.toMatchObject({
        code: 'ENOENT',
      });
    },
  );

  it('rejects a truncated final PBF block even if its published length matches', async () => {
    const path = await output();
    await writeFile(path, body.subarray(0, -1));
    await expect(validatePbfFile(path, timestamp, now)).rejects.toThrow();
  });

  it('reuses a validated cache without network calls and rejects stale cached source dates', async () => {
    const path = await output();
    const fetcher = upstream();
    await writeFile(path, body);
    expect(
      await downloadGeofabrikExtract(
        { url: latest, outputPath: path },
        options(fetcher),
      ),
    ).toEqual({ sourceTimestamp: timestamp, cached: true });
    expect(fetcher).not.toHaveBeenCalled();
    await writeFile(path, pbf('2026-07-30T20:22:42Z'));
    await expect(
      downloadGeofabrikExtract(
        { url: latest, outputPath: path },
        options(fetcher),
      ),
    ).rejects.toThrow('stale');
  });

  it.each(['stale', 'mixed', 'incomplete', 'future'])(
    'does not permit a %s staged OSM release',
    (failure) => {
      expect(() =>
        assertFreshOsmRelease(
          [
            {
              id: 'parking',
              oldestSourceAt:
                failure === 'stale'
                  ? '2026-07-30'
                  : failure === 'future'
                    ? '2026-10-02'
                    : timestamp,
              complete: failure !== 'incomplete',
              mixedAge: failure === 'mixed',
            },
          ],
          now,
        ),
      ).toThrow('not promoted');
    },
  );

  it('rejects duplicate publication rows', () => {
    expect(() => parsePublication(html() + html(), latest, now)).toThrow(
      'ambiguous',
    );
  });
});

describe('upstream freshness uses the shared resolver and actual OSM cutoff', () => {
  it.each([null, 'invalid', '2026-07-30', '2026-10-02'])(
    'flags missing, invalid, stale or future local cutoff %s',
    async (oldestSourceAt) => {
      const report = await checkDataFreshness(
        {
          osmInputsMatch: true,
          datasets: [
            {
              id: 'parking',
              releaseId: 'fixture',
              complete: true,
              mixedAge: false,
              oldestSourceAt,
              inputs: [],
            },
          ],
        },
        { now },
      );
      expect(report.datasets[0].stale).toBe(true);
    },
  );
  it('reports a newer cutoff even when the previous download was retrieved later', async () => {
    const fetcher = upstream((url) =>
      url === latest ? new Response(null, { status: 404 }) : undefined,
    );
    const report = await checkDataFreshness(
      {
        osmInputsMatch: true,
        datasets: [
          {
            id: 'parking',
            releaseId: 'fixture',
            complete: true,
            mixedAge: false,
            oldestSourceAt: '2026-09-29T20:22:42Z',
            inputs: [
              {
                id: 'berkshire',
                sourceUrl: latest,
                sourceTimestamp: '2026-09-29T20:22:42Z',
                retrievedAt: '2026-10-01T11:00:00Z',
              },
            ],
          },
        ],
      },
      { ...options(fetcher), checkUpstream: true },
    );
    expect(report.upstream).toEqual([
      expect.objectContaining({
        id: 'berkshire',
        downloadUrl: dated,
        sourceTimestamp: timestamp,
        fallback: true,
        newerPublication: true,
      }),
    ]);
    expect(report.datasets[0]).toHaveProperty('stale', false);
  });

  it('does not confuse a rebuild/retrieval timestamp with newer source data', async () => {
    const report = await checkDataFreshness(
      {
        osmInputsMatch: true,
        datasets: [
          {
            id: 'cycling-pois',
            releaseId: 'fixture',
            complete: true,
            mixedAge: false,
            oldestSourceAt: timestamp,
            inputs: [
              {
                id: 'berkshire',
                sourceUrl: latest,
                sourceTimestamp: timestamp,
                retrievedAt: '2026-09-30T21:00:00Z',
              },
            ],
          },
        ],
      },
      { ...options(upstream()), checkUpstream: true },
    );
    expect(report.upstream[0]).toHaveProperty('newerPublication', false);
  });

  it('reports invalid publication metadata as an upstream error', async () => {
    const report = await checkDataFreshness(
      {
        osmInputsMatch: true,
        datasets: [
          {
            id: 'parking',
            releaseId: 'fixture',
            complete: true,
            mixedAge: false,
            oldestSourceAt: timestamp,
            inputs: [
              {
                id: 'berkshire',
                sourceUrl: latest,
                sourceTimestamp: timestamp,
              },
            ],
          },
        ],
      },
      { ...options(upstream(undefined, 'error page')), checkUpstream: true },
    );
    expect(report.upstream[0].error).toContain('timestamp');
  });
});

describe('one-invocation publication plan', () => {
  const inputs = [{ id: 'berkshire', url: latest }];
  async function fixture() {
    const fetcher = upstream();
    const { plan, context } = await createPublicationPlan(
      'a'.repeat(40),
      options(fetcher),
      inputs,
    );
    const path = await output();
    const planPath = path + '.json';
    await writeFile(planPath, JSON.stringify(plan));
    const env = {
      NEUK_PUBLICATION_PLAN: planPath,
      NEUK_PLAN_INVOCATION: context.invocationId,
      NEUK_PLAN_REVISION: context.codeRevision,
      NEUK_PLAN_DIGEST: context.digest,
    };
    return { plan, context, path, planPath, env, fetcher };
  }

  it('downloads and retries only the pinned dated file when metadata disappears', async () => {
    const f = await fixture();
    let full = 0;
    const fetcher = upstream((url) => {
      expect(url).toBe(dated);
      if (++full === 1)
        return new Response(body.subarray(0, -1), {
          headers: {
            'content-type': 'application/octet-stream',
            'content-length': String(body.length),
          },
        });
    });
    const runner = (await openPublicationPlan(
      f.env,
      options(fetcher),
      inputs,
    ))!;
    const result = await runner.download({
      url: latest,
      outputPath: f.path,
      forceDownload: true,
    });
    expect(result).toMatchObject({
      downloadUrl: dated,
      publicationPlanId: f.plan.invocationId,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(f.fetcher.mock.calls.map(([url]) => url)).toEqual([
      page,
      dated,
      dated,
    ]);
    const cached = await runner.download({ url: latest, outputPath: f.path });
    expect(cached.sha256).toBe(result.sha256);
    expect(cached.cached).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const input = {
      id: 'berkshire',
      sourceUrl: latest,
      sourceTimestamp: timestamp,
      downloadUrl: dated,
      publicationPlanId: f.plan.invocationId,
      publicationValidatedAt: f.plan.sources[0].validatedAt,
      publishedAt: f.plan.sources[0].publishedAt,
      sha256: result.sha256,
    };
    await expect(
      runner.assertRelease({ datasets: [{ id: 'parking', inputs: [input] }] }, [
        'parking',
      ]),
    ).resolves.toBeDefined();
    for (const patch of [
      { sha256: 'f'.repeat(64) },
      { sourceTimestamp: '2026-09-29' },
      { sourceUrl: latest.replace('berkshire', 'bristol') },
      { publicationPlanId: 'foreign' },
      { publicationValidatedAt: '2026-10-01T11:59:59Z' },
      { publishedAt: '2026-10-01T03:00:00Z' },
      { downloadUrl: latest },
    ])
      await expect(
        runner.assertRelease(
          { datasets: [{ id: 'parking', inputs: [{ ...input, ...patch }] }] },
          ['parking'],
        ),
      ).rejects.toThrow();
    await expect(
      runner.assertRelease(
        { datasets: [{ id: 'parking', inputs: [input, input] }] },
        ['parking'],
      ),
    ).rejects.toThrow();
    await expect(
      runner.assertRelease({ datasets: [] }, ['parking']),
    ).rejects.toThrow();
  });

  it.each([
    'changed',
    'foreign invocation',
    'foreign revision',
    'expired',
    'future',
    'missing',
    'duplicate',
    'unknown',
    'foreign URL',
    'wrong region',
    'wrong dated URL',
    'stale cutoff',
    'future cutoff',
    'invalid size',
    'publication date',
  ])('rejects a %s plan before download', async (failure) => {
    const f = await fixture();
    const p = structuredClone(f.plan);
    const c = { ...f.context };
    let checkAt = now;
    if (failure === 'changed') p.sources[0].bytes += 1;
    if (failure === 'foreign invocation') c.invocationId = 'other';
    if (failure === 'foreign revision') c.codeRevision = 'b'.repeat(40);
    if (failure === 'expired') checkAt = Date.parse(p.expiresAt);
    if (failure === 'future') checkAt = now - 1;
    if (failure === 'missing') p.sources = [];
    if (failure === 'duplicate') p.sources.push(p.sources[0]);
    if (failure === 'unknown') p.sources[0].id = 'bristol';
    if (failure === 'foreign URL')
      p.sources[0].latestUrl = latest.replace(
        'download.geofabrik.de',
        'evil.example',
      );
    if (failure === 'wrong region')
      p.sources[0].latestUrl = latest.replace('berkshire', 'bristol');
    if (failure === 'wrong dated URL') p.sources[0].downloadUrl = latest;
    if (failure === 'stale cutoff')
      p.sources[0].sourceTimestamp = '2026-07-30T20:22:42Z';
    if (failure === 'future cutoff')
      p.sources[0].sourceTimestamp = '2026-10-02T20:22:42Z';
    if (failure === 'invalid size') p.sources[0].bytes = 0;
    if (failure === 'publication date') p.sources[0].publishedAt = '2026-09-29';
    if (failure !== 'changed') c.digest = planDigest(p);
    expect(() => validatePublicationPlan(p, c, checkAt, inputs)).toThrow();
  });

  it('rejects changed plan on disk, unplanned requests, missing receipts and changed cache', async () => {
    const f = await fixture();
    const fetcher = upstream();
    const runner = (await openPublicationPlan(
      f.env,
      options(fetcher),
      inputs,
    ))!;
    await expect(
      runner.download({
        url: latest.replace('berkshire', 'bristol'),
        outputPath: f.path,
      }),
    ).rejects.toThrow('Unplanned');
    await writeFile(f.path, body);
    await expect(
      runner.download({ url: latest, outputPath: f.path }),
    ).rejects.toThrow('receipt');
    expect(fetcher).not.toHaveBeenCalled();
    await runner.download({
      url: latest,
      outputPath: f.path,
      forceDownload: true,
    });
    await writeFile(f.path, pbf('2026-09-29T20:22:42Z'));
    await expect(
      runner.download({ url: latest, outputPath: f.path }),
    ).rejects.toThrow('timestamp');
    await writeFile(f.path, body);
    const receiptsPath = f.planPath + '.receipts.json';
    const receipts = JSON.parse(await readFile(receiptsPath, 'utf8'));
    receipts.inputs.berkshire.sha256 = '0'.repeat(64);
    await writeFile(receiptsPath, JSON.stringify(receipts));
    await expect(
      runner.download({ url: latest, outputPath: f.path }),
    ).rejects.toThrow('hash');
    await writeFile(
      f.planPath,
      JSON.stringify({ ...f.plan, invocationId: 'changed' }),
    );
    await expect(
      runner.download({ url: latest, outputPath: f.path, forceDownload: true }),
    ).rejects.toThrow('plan');
  });

  it('rejects mixed source dates even though each input is within its age limit', async () => {
    const f = await fixture();
    f.plan.sources.push({
      ...f.plan.sources[0],
      id: 'bristol',
      latestUrl: latest.replace('berkshire', 'bristol'),
      datedUrl: dated.replace('berkshire-260930', 'bristol-260927'),
      downloadUrl: dated.replace('berkshire-260930', 'bristol-260927'),
      sourceTimestamp: '2026-09-27T20:22:42.000Z',
      publishedAt: '2026-09-28T02:01:00Z',
    });
    f.context.digest = planDigest(f.plan);
    expect(() =>
      validatePublicationPlan(f.plan, f.context, now, [
        ...inputs,
        { id: 'bristol', url: latest.replace('berkshire', 'bristol') },
      ]),
    ).toThrow('mixed-age');
  });

  it.each(['truncated', 'corrupt', 'timestamp', 'HTML', 'alias redirect'])(
    'preserves the old cache after a pinned %s failure',
    async (failure) => {
      const f = await fixture();
      await writeFile(f.path, 'previous cache');
      const fetcher = upstream((url) => {
        expect(url).toBe(dated);
        if (failure === 'alias redirect')
          return new Response(null, {
            status: 302,
            headers: { location: latest },
          });
        const bytes =
          failure === 'truncated'
            ? body.subarray(0, -1)
            : failure === 'timestamp'
              ? pbf('2026-09-29T20:22:42Z')
              : failure === 'corrupt'
                ? Buffer.concat([body.subarray(0, -2), Buffer.from([0, 0])])
                : body;
        return new Response(bytes, {
          headers: {
            'content-type':
              failure === 'HTML' ? 'text/html' : 'application/octet-stream',
            'content-length': String(body.length),
          },
        });
      });
      const runner = (await openPublicationPlan(
        f.env,
        options(fetcher),
        inputs,
      ))!;
      await expect(
        runner.download({
          url: latest,
          outputPath: f.path,
          forceDownload: true,
        }),
      ).rejects.toThrow();
      expect(await readFile(f.path, 'utf8')).toBe('previous cache');
      await expect(stat(f.path + '.download')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(stat(f.planPath + '.receipts.json')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      expect(fetcher.mock.calls.every(([url]) => url === dated)).toBe(true);
    },
  );

  it('leaves the real coordinator release untouched when a pinned download fails', async () => {
    const root = join(await output(), '..');
    const repo = new URL('../../', import.meta.url).pathname;
    await cp(join(repo, 'scripts'), join(root, 'scripts'), { recursive: true });
    await symlink(
      join(repo, 'node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    await mkdir(join(root, 'public/data'), { recursive: true });
    await mkdir(join(root, 'src/data'), { recursive: true });
    const previous = [
      'public/data/marker',
      'src/data/cycle-parking.json',
      'src/data/cycle-parking-report.json',
      'src/data/cycling-poi-report.json',
      'src/data/cycle-network-report.json',
    ];
    for (const path of previous)
      await writeFile(join(root, path), 'previous release');
    const preload = join(root, 'fetch.mjs');
    await writeFile(
      preload,
      `
      Date.now = () => ${now};
      const body = Buffer.from(${JSON.stringify(body.toString('base64'))}, 'base64');
      globalThis.fetch = async (value, init = {}) => {
        const url = String(value);
        if (url.endsWith('.html')) {
          const stem = new URL(url).pathname.split('/').at(-1).replace('.html', '');
          return new Response(${JSON.stringify(html())}.replaceAll('berkshire', stem), { headers: { 'content-type': 'text/html' } });
        }
        if (url.endsWith('-260930.osm.pbf')) {
          const headers = { 'content-type': 'application/octet-stream', 'content-length': String(body.length) };
          if (init.method === 'HEAD') return new Response(null, { headers });
          if (init.headers?.Range) {
            headers['content-range'] = 'bytes 0-' + (body.length - 1) + '/' + body.length;
            return new Response(body, { status: 206, headers });
          }
          return new Response('upstream error body', { headers: { 'content-type': 'text/html' } });
        }
        if (url.includes('Public_Bike_Parking/FeatureServer/0/query')) return Response.json({ features: [] });
        throw new Error('Unexpected coordinator fixture request: ' + url);
      };
    `,
    );
    let failed = '';
    try {
      execFileSync(
        process.execPath,
        [
          '--import',
          preload,
          join(root, 'scripts/refresh-data-release.mjs'),
          'all',
        ],
        {
          env: {
            ...process.env,
            NODE_OPTIONS: '--import=' + preload,
            GIT_DIR: join(repo, '.git'),
          },
          timeout: 15_000,
          stdio: 'pipe',
        },
      );
    } catch (error) {
      failed = String((error as { stderr: Buffer }).stderr);
    }
    expect(failed).toContain('Expected unencoded PBF');
    expect(failed).toContain('previous release preserved');
    for (const path of previous)
      expect(await readFile(join(root, path), 'utf8')).toBe('previous release');
    await expect(
      stat(join(root, '.cache/data-refresh.lock')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a plan that expires while downloading and incomplete context', async () => {
    const f = await fixture();
    const settings = options(upstream());
    const expires = Date.parse(f.plan.expiresAt);
    settings.fetcher = upstream(() => {
      settings.now = expires;
    });
    const runner = (await openPublicationPlan(f.env, settings, inputs))!;
    await expect(
      runner.download({ url: latest, outputPath: f.path, forceDownload: true }),
    ).rejects.toThrow('expired');
    await expect(stat(f.planPath + '.receipts.json')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      openPublicationPlan(
        { NEUK_PUBLICATION_PLAN: f.planPath },
        options(upstream()),
        inputs,
      ),
    ).rejects.toThrow('Incomplete');
  });

  it('bounds metadata HTTP and body retries but rejects permanent errors immediately', async () => {
    const sleep = vi.fn(async () => {});
    let count = 0;
    const fetcher = upstream((url) => {
      if (url !== page) return;
      count += 1;
      if (count === 1) return new Response(null, { status: 503 });
      if (count === 2)
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new TypeError('socket body closed'));
            },
          }),
          { headers: { 'content-type': 'text/html' } },
        );
    });
    await expect(
      resolveGeofabrikExtract(latest, { ...options(fetcher), sleep }),
    ).resolves.toBeDefined();
    expect(sleep.mock.calls).toEqual([[5000], [15000]]);
    const permanent = upstream((url) =>
      url === page ? new Response(null, { status: 404 }) : undefined,
    );
    await expect(
      resolveGeofabrikExtract(latest, options(permanent)),
    ).rejects.toThrow('404');
    expect(permanent).toHaveBeenCalledTimes(1);
  });
});
