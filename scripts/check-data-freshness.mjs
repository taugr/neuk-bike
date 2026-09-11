import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const freshness = JSON.parse(
  await readFile(resolve(root, 'public/data/freshness.json'), 'utf8'),
);
const checkUpstream = process.argv.includes('--upstream');
const now = Date.now();
const checks = [];
const upstream = new Map();
for (const dataset of freshness.datasets) {
  const ageDays = dataset.oldestSourceAt
    ? Math.floor((now - Date.parse(dataset.oldestSourceAt)) / 86_400_000)
    : null;
  const stale = ageDays === null || ageDays > 35;
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
        const response = await fetch(`${input.sourceUrl}?f=json`, {
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
        const response = await fetch(input.sourceUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const lastModified = response.headers.get('last-modified');
        upstream.set(input.sourceUrl, {
          id: input.id,
          lastModified,
          etag: response.headers.get('etag'),
          newerPublication:
            lastModified && input.retrievedAt
              ? Date.parse(lastModified) > Date.parse(input.retrievedAt)
              : null,
        });
      }
    } catch (error) {
      upstream.set(input.sourceUrl, { id: input.id, error: error.message });
    }
  }
}
const report = {
  checkedAt: new Date(now).toISOString(),
  osmInputsMatch: freshness.osmInputsMatch,
  datasets: checks,
  upstream: [...upstream.values()],
};
await mkdir(resolve(root, '.cache'), { recursive: true });
await writeFile(
  resolve(root, '.cache/source-status.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
if (
  checks.some((check) => check.stale || !check.complete || check.mixedAge) ||
  !freshness.osmInputsMatch ||
  report.upstream.some((input) => input.error)
)
  process.exitCode = 1;
