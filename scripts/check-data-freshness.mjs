import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveGeofabrikExtract,
  maximumSourceAgeDays,
  describeDownloadError,
} from './geofabrik-download.mjs';
import { osmInputs } from './parking-data-sources.mjs';

export async function checkDataFreshness(
  freshness,
  {
    checkUpstream = false,
    now = Date.now(),
    fetcher = fetch,
    log = console.warn,
  } = {},
) {
  const checks = [];
  const upstream = new Map();
  for (const dataset of freshness.datasets) {
    const oldest = Date.parse(dataset.oldestSourceAt);
    const ageDays = Number.isFinite(oldest)
      ? Math.floor((now - oldest) / 86_400_000)
      : null;
    const stale =
      ageDays === null ||
      oldest > now ||
      now - oldest > maximumSourceAgeDays * 86_400_000;
    checks.push({
      id: dataset.id,
      ageDays,
      stale,
      complete: dataset.complete,
      mixedAge: dataset.mixedAge,
      releaseId: dataset.releaseId,
    });
    if (!checkUpstream) continue;
    for (const input of dataset.inputs) {
      if (upstream.has(input.sourceUrl)) continue;
      try {
        if (dataset.id === 'cycle-network') {
          const response = await fetcher(`${input.sourceUrl}?f=json`, {
            signal: AbortSignal.timeout(30_000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const layer = await response.json();
          const edited = layer.editingInfo?.dataLastEditDate;
          if (!Number.isFinite(edited))
            throw new Error('Missing source edit timestamp');
          upstream.set(input.sourceUrl, {
            id: input.id,
            dataEditedAt: new Date(edited).toISOString(),
            newerPublication: edited > Date.parse(input.sourceTimestamp),
          });
        } else {
          const configured = osmInputs.find((source) => source.id === input.id);
          if (!configured || input.sourceUrl !== configured.url)
            throw new Error(`Unknown or mismatched OSM input ${input.id}`);
          const source = await resolveGeofabrikExtract(configured.url, {
            now,
            fetcher,
            log,
          });
          upstream.set(input.sourceUrl, {
            id: input.id,
            lastModified: source.lastModified,
            etag: source.etag,
            downloadUrl: source.downloadUrl,
            fallback: source.fallback,
            sourceTimestamp: source.sourceTimestamp,
            bytes: source.bytes,
            newerPublication:
              Date.parse(source.sourceTimestamp) >
              Date.parse(input.sourceTimestamp),
          });
        }
      } catch (error) {
        upstream.set(input.sourceUrl, {
          id: input.id,
          error: describeDownloadError(error),
        });
      }
    }
  }
  return {
    checkedAt: new Date(now).toISOString(),
    osmInputsMatch: freshness.osmInputsMatch,
    datasets: checks,
    upstream: [...upstream.values()],
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = process.env.NEUK_DATA_ROOT
    ? resolve(process.env.NEUK_DATA_ROOT)
    : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const freshness = JSON.parse(
    await readFile(resolve(root, 'public/data/freshness.json'), 'utf8'),
  );
  const report = await checkDataFreshness(freshness, {
    checkUpstream: process.argv.includes('--upstream'),
  });
  const output = resolve(
    root,
    process.argv.find((arg) => arg.startsWith('--output='))?.slice(9) ??
      '.cache/source-status.json',
  );
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (
    report.datasets.some(
      (check) => check.stale || !check.complete || check.mixedAge,
    ) ||
    !freshness.osmInputsMatch ||
    report.upstream.some((input) => input.error)
  )
    process.exitCode = 1;
}
