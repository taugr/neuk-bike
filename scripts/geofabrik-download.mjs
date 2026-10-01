import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { inflateSync } from 'node:zlib';
import { OSMTransform } from 'osm-pbf-parser-node';
import { maximumSourceAgeDays } from './data-release-utils.mjs';
export { maximumSourceAgeDays } from './data-release-utils.mjs';

const origin = 'https://download.geofabrik.de';
const day = 86_400_000;
const probeBytes = 65_536;

function trustedUrl(value, paths) {
  const url = new URL(value);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (paths && !paths.includes(url.pathname))
  )
    throw new Error(`Untrusted or mismatched Geofabrik URL: ${url}`);
  return url;
}

function sourceUrls(value) {
  const latest = trustedUrl(value);
  if (!/^\/[a-z0-9/-]+-latest\.osm\.pbf$/.test(latest.pathname))
    throw new Error(`Expected a Geofabrik latest extract URL: ${latest}`);
  const stem = latest.pathname.replace(/-latest\.osm\.pbf$/, '');
  return { latest, stem, page: new URL(`${stem}.html`, origin) };
}

export function describeDownloadError(error) {
  const messages = [];
  for (
    let current = error;
    current && messages.length < 4;
    current = current.cause
  )
    messages.push(
      `${current.message ?? current}${current.code ? ` (${current.code})` : ''}`,
    );
  return messages.join(': ');
}

// Redirects are explicit: the proxy's erroneous .pbf/ redirect must never be
// followed, and extract requests cannot leave the official region's paths.
async function request(url, init, paths, options) {
  const {
    fetcher = fetch,
    log = console.warn,
    sleep = (ms) => new Promise((accept) => setTimeout(accept, ms)),
  } = options;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let current = trustedUrl(url, paths);
    const seen = new Set();
    try {
      for (let hop = 0; hop <= 4; hop += 1) {
        if (seen.has(current.href))
          throw new Error(`Redirect loop at ${current}`);
        seen.add(current.href);
        const response = await fetcher(current.href, {
          ...init,
          redirect: 'manual',
          headers: { 'Accept-Encoding': 'identity', ...init.headers },
          signal: AbortSignal.timeout(
            options.timeoutMs ??
              (init.method === 'HEAD' || init.headers?.Range
                ? 30_000
                : 900_000),
          ),
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          const location = response.headers.get('location');
          if (!location)
            throw new Error(`Redirect without Location at ${current}`);
          const next = new URL(location, current);
          log(
            `Geofabrik ${init.method ?? 'GET'} attempt ${attempt}/2: ${response.status} ${current} -> ${next}`,
          );
          current = trustedUrl(next, paths);
          if (hop === 4)
            throw new Error(`Redirect limit exceeded at ${current}`);
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          const error = new Error(
            `HTTP ${response.status} ${response.statusText} at ${current}`,
          );
          error.retryable = response.status >= 500 || response.status === 429;
          throw error;
        }
        return { response, url: current.href };
      }
    } catch (error) {
      log(
        `Geofabrik ${init.method ?? 'GET'} attempt ${attempt}/2 ${url}: ${describeDownloadError(error)}`,
      );
      // Invalid redirects/metadata and permanent HTTP errors are not improved
      // by retrying. Network failures and transient HTTP errors get one retry.
      if (
        attempt === 2 ||
        (error.retryable !== true && !(error instanceof TypeError))
      )
        throw error;
      await sleep(1_000);
    }
  }
}

async function boundedBody(response, maximum) {
  if (!response.body) throw new Error('Missing response body');
  const chunks = [];
  let length = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximum)
        throw new Error(`Response exceeds ${maximum} bytes`);
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

export function validateSourceTimestamp(timestamp, now = Date.now()) {
  const time = Date.parse(timestamp);
  if (
    !Number.isFinite(time) ||
    time > now ||
    now - time > maximumSourceAgeDays * day
  )
    throw new Error(
      `Missing, future or stale OSM source timestamp: ${timestamp}`,
    );
  return new Date(time).toISOString();
}

export function parsePublication(html, latestUrl, now = Date.now()) {
  const { latest, stem } = sourceUrls(latestUrl);
  // Bind the cutoff to the correct latest link, not another format or region.
  const item = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].find(
    ([, value]) =>
      [...value.matchAll(/href="([^"]+)"/gi)].some(
        ([, href]) => new URL(href, latest).href === latest.href,
      ),
  )?.[1];
  const timestamp = item?.match(
    /contains all OSM data up to (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/,
  )?.[1];
  const sourceTimestamp = validateSourceTimestamp(timestamp, now);
  const suffix = sourceTimestamp.slice(2, 10).replaceAll('-', '');
  const dated = new URL(`${stem}-${suffix}.osm.pbf`, origin);
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].filter(
    ([, row]) =>
      [...row.matchAll(/href="([^"]+)"/gi)].some(
        ([, href]) => new URL(href, latest).href === dated.href,
      ),
  );
  if (rows.length !== 1)
    throw new Error(`Missing or ambiguous current dated publication: ${dated}`);
  const cells = [...rows[0][1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
    ([, cell]) => cell.replace(/<[^>]*>/g, '').trim(),
  );
  const bytes = Number(cells[2]);
  const publishedAt = Date.parse(`${cells[1]?.replace(' ', 'T')}:00Z`);
  if (
    cells.length !== 3 ||
    !/^\d+$/.test(cells[2]) ||
    !Number.isSafeInteger(bytes) ||
    bytes <= 0 ||
    !Number.isFinite(publishedAt) ||
    publishedAt < Date.parse(sourceTimestamp) ||
    publishedAt > now ||
    publishedAt - Date.parse(sourceTimestamp) > 2 * day
  )
    throw new Error(`Invalid dated publication size/date: ${dated}`);
  return {
    latestUrl: latest.href,
    datedUrl: dated.href,
    sourceTimestamp,
    bytes,
    publishedAt: new Date(publishedAt).toISOString(),
  };
}

function binaryHeaders(response, bytes, ranged = false) {
  const type = response.headers.get('content-type')?.split(';')[0].trim();
  if (
    !['application/octet-stream', 'application/x-protobuf'].includes(type) ||
    (response.headers.get('content-encoding') &&
      response.headers.get('content-encoding') !== 'identity')
  )
    throw new Error(`Expected unencoded PBF, received ${type}`);
  if (
    !ranged &&
    (response.status !== 200 ||
      Number(response.headers.get('content-length')) !== bytes)
  )
    throw new Error(
      `PBF size/status does not match publication (${bytes} bytes)`,
    );
}

async function pbfSourceTimestamp(prefix, now = Date.now()) {
  if (prefix.length < 4) throw new Error('Truncated PBF header');
  const headerLength = prefix.readUInt32BE(0);
  if (
    headerLength < 1 ||
    headerLength > 64 * 1024 ||
    prefix.length < 4 + headerLength ||
    !prefix.subarray(4, 4 + headerLength).includes(Buffer.from('OSMHeader'))
  )
    throw new Error('Missing or invalid OSMHeader');
  const parser = new OSMTransform({ writeRaw: true });
  // A range deliberately ends inside an OSMData block; only a full-file
  // validation should require complete framing at EOF.
  parser._flush = (done) => done();
  // Consume only the first bounded prefix; the normal extraction passes still
  // decode the entire file before any dataset can be promoted.
  const records = Readable.from([prefix]).pipe(parser);
  for await (const items of records) {
    const header = items.find((item) => item.osmosis_replication_timestamp);
    if (header)
      return validateSourceTimestamp(
        new Date(header.osmosis_replication_timestamp * 1_000).toISOString(),
        now,
      );
  }
  throw new Error('Missing PBF replication timestamp');
}

async function probe(publication, value, options) {
  const paths = [
    new URL(publication.latestUrl).pathname,
    new URL(publication.datedUrl).pathname,
  ];
  const head = await request(value, { method: 'HEAD' }, paths, options);
  binaryHeaders(head.response, publication.bytes);
  const end = Math.min(probeBytes, publication.bytes) - 1;
  const range = await request(
    head.url,
    { headers: { Range: `bytes=0-${end}` } },
    paths,
    options,
  );
  try {
    binaryHeaders(range.response, publication.bytes, true);
    if (
      range.response.status !== 206 ||
      range.response.headers.get('content-range') !==
        `bytes 0-${end}/${publication.bytes}`
    )
      throw new Error('Missing or mismatched bounded PBF Content-Range');
    const prefix = await boundedBody(range.response, end + 1);
    if (prefix.length !== end + 1) throw new Error('Truncated PBF probe');
    if (
      (await pbfSourceTimestamp(prefix, options.now)) !==
      publication.sourceTimestamp
    )
      throw new Error(
        'PBF source timestamp does not match official publication',
      );
  } finally {
    if (!range.response.bodyUsed) await range.response.body?.cancel();
  }
  return {
    ...publication,
    downloadUrl: range.url,
    lastModified: head.response.headers.get('last-modified'),
    etag: head.response.headers.get('etag'),
    fallback: range.url !== publication.latestUrl,
  };
}

// The existing parser validates complete block framing at EOF. Inflate every
// data block as well, without another full feature decode.
export async function validatePbfFile(
  path,
  expectedTimestamp,
  now = Date.now(),
) {
  const parser = new OSMTransform({ writeRaw: true });
  let headers = 0;
  let blocks = 0;
  let timestamp;
  let validationError;
  try {
    await pipeline(createReadStream(path), parser, async (records) => {
      try {
        for await (const items of records) {
          if (Buffer.isBuffer(items)) {
            // Validate each compressed payload/checksum with bounded memory, while
            // leaving feature decoding to the existing extraction passes.
            inflateSync(items, { maxOutputLength: 32 * 1024 * 1024 });
            blocks += 1;
            continue;
          }
          for (const item of items) {
            headers += 1;
            timestamp = new Date(
              item.osmosis_replication_timestamp * 1_000,
            ).toISOString();
          }
        }
      } catch (error) {
        validationError = error;
        throw error;
      }
    });
  } catch (error) {
    throw validationError ?? error;
  }
  if (headers !== 1 || blocks === 0)
    throw new Error('Incomplete or invalid PBF block framing');
  timestamp = validateSourceTimestamp(timestamp, now);
  if (expectedTimestamp && timestamp !== expectedTimestamp)
    throw new Error('PBF source timestamp does not match official publication');
  return timestamp;
}

export async function resolveGeofabrikExtract(latestUrl, options = {}) {
  const { latest, page } = sourceUrls(latestUrl);
  const metadata = await request(page.href, {}, [page.pathname], {
    ...options,
    timeoutMs: 30_000,
  });
  if (!metadata.response.headers.get('content-type')?.startsWith('text/html')) {
    await metadata.response.body?.cancel();
    throw new Error('Expected official Geofabrik publication HTML');
  }
  const publication = parsePublication(
    (await boundedBody(metadata.response, 2 * 1024 * 1024)).toString('utf8'),
    latest.href,
    options.now,
  );
  if (!options.preferDated) {
    try {
      return await probe(publication, latest.href, options);
    } catch (error) {
      (options.log ?? console.warn)(
        `Geofabrik latest failed: ${describeDownloadError(error)}; validating dated publication ${publication.datedUrl}`,
      );
    }
  }
  return probe(publication, publication.datedUrl, options);
}

export async function downloadGeofabrikExtract(
  { url, outputPath, forceDownload = false, label = url },
  options = {},
) {
  if (!forceDownload) {
    try {
      if ((await stat(outputPath)).size > 0) {
        const sourceTimestamp = await validatePbfFile(
          outputPath,
          undefined,
          options.now,
        );
        (options.log ?? console.log)(
          `Using cached ${label} at ${outputPath}; OSM cutoff ${sourceTimestamp}`,
        );
        return { sourceTimestamp, cached: true };
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await mkdir(dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.download`;
  let source = await resolveGeofabrikExtract(url, options);
  try {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await rm(temporary, { force: true });
        (options.log ?? console.log)(
          `Downloading ${label}, attempt ${attempt}/2: ${source.downloadUrl}; ${source.bytes} bytes, OSM cutoff ${source.sourceTimestamp}`,
        );
        const paths = [
          new URL(source.latestUrl).pathname,
          new URL(source.datedUrl).pathname,
        ];
        const { response, url: downloadUrl } = await request(
          source.downloadUrl,
          {},
          paths,
          options,
        );
        source = {
          ...source,
          downloadUrl,
          fallback: downloadUrl !== source.latestUrl,
        };
        try {
          binaryHeaders(response, source.bytes);
        } catch (error) {
          await response.body?.cancel();
          throw error;
        }
        let length = 0;
        const hash = createHash('sha256');
        const inspect = new Transform({
          transform(chunk, _encoding, done) {
            length += chunk.length;
            hash.update(chunk);
            done(
              length > source.bytes
                ? new Error('PBF exceeds published size')
                : null,
              chunk,
            );
          },
        });
        await pipeline(
          Readable.fromWeb(response.body),
          inspect,
          createWriteStream(temporary),
        );
        if (length !== source.bytes)
          throw new Error(`Truncated PBF: ${length}/${source.bytes} bytes`);
        await validatePbfFile(temporary, source.sourceTimestamp, options.now);
        await rename(temporary, outputPath);
        return { ...source, sha256: hash.digest('hex'), cached: false };
      } catch (error) {
        (options.log ?? console.warn)(
          `Geofabrik download attempt ${attempt}/2 ${source.downloadUrl}: ${describeDownloadError(error)}`,
        );
        if (attempt === 2) throw error;
        source = await resolveGeofabrikExtract(url, {
          ...options,
          preferDated: true,
        });
      }
    }
  } finally {
    await rm(temporary, { force: true });
  }
}
