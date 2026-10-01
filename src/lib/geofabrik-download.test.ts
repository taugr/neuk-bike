import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  mkdir,
  stat,
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
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(settings.log).toHaveBeenCalledWith(
      expect.stringContaining('socket closed'),
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
  it('runs both real command-line updaters against a dated fallback without network access', async () => {
    const root = join(await output(), '..');
    await mkdir(join(root, 'src/data'), { recursive: true });
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
        if (url === page) return new Response(${JSON.stringify(html())}, { headers: { 'content-type': 'text/html' } });
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
          '--force-download',
        ],
        {
          env: {
            ...process.env,
            NEUK_DATA_ROOT: root,
            NEUK_DATA_CACHE_ROOT: join(root, 'cache'),
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
