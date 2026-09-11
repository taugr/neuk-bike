import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promoteStagedPaths } from './data-release-utils.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const definitions = {
  parking: 'cycle-parking',
  pois: 'cycling-poi',
  network: 'cycle-network',
};
const [selection = 'all', ...args] = process.argv.slice(2);
if (
  !(selection === 'all' || selection in definitions) ||
  args.some((arg) => !['--cached', '--force-download'].includes(arg)) ||
  (args.includes('--cached') && args.includes('--force-download'))
) {
  throw new Error(
    'Usage: refresh-data-release.mjs [all|parking|pois|network] [--cached|--force-download]. Partial region releases are not supported.',
  );
}
const cache = resolve(root, '.cache');
await mkdir(cache, { recursive: true });
const lock = resolve(cache, 'data-refresh.lock');
await mkdir(lock); // A second refresh must not race the cache or promotion.
let staging;
try {
  staging = await mkdtemp(resolve(cache, 'data-release-'));
  await mkdir(resolve(staging, 'src/data'), { recursive: true });
  await cp(resolve(root, 'public/data'), resolve(staging, 'public/data'), {
    recursive: true,
  });
  for (const name of [
    'cycle-parking.json',
    'cycle-parking-report.json',
    'cycling-poi-report.json',
    'cycle-network-report.json',
  ]) {
    await cp(
      resolve(root, 'src/data', name),
      resolve(staging, 'src/data', name),
    );
  }
  async function run(script, scriptArgs = []) {
    await new Promise((accept, reject) => {
      const child = spawn(
        process.execPath,
        [resolve(root, 'scripts', script), ...scriptArgs],
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            NEUK_DATA_ROOT: staging,
            NEUK_DATA_CACHE_ROOT: cache,
          },
        },
      );
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0
          ? accept()
          : reject(new Error(`${script} exited with ${code}`)),
      );
    });
  }
  const selected = selection === 'all' ? Object.keys(definitions) : [selection];
  for (const dataset of selected) {
    const download =
      dataset !== 'network' &&
      !args.includes('--cached') &&
      !(selection === 'all' && dataset === 'pois');
    await run(
      `update-${definitions[dataset]}-data.mjs`,
      download ? ['--force-download'] : [],
    );
    await run(`verify-${definitions[dataset]}-data.mjs`);
  }
  await run('write-data-freshness.mjs');
  const freshness = JSON.parse(
    await readFile(resolve(staging, 'public/data/freshness.json'), 'utf8'),
  );
  if (freshness.datasets.some((dataset) => !dataset.complete))
    throw new Error('Incomplete source set: release was not promoted.');
  if (selection === 'all' && !freshness.osmInputsMatch)
    throw new Error(
      'Parking and POI input hashes differ: release was not promoted.',
    );
  await promoteStagedPaths(staging, root, [
    'public/data',
    'src/data/cycle-parking.json',
    'src/data/cycle-parking-report.json',
    'src/data/cycling-poi-report.json',
    'src/data/cycle-network-report.json',
    'src/data/data-freshness-summary.json',
  ]);
  console.log(
    `Verified release installed. Previous files retained at ${resolve(staging, '.previous')}`,
  );
} catch (error) {
  console.error(
    `Refresh failed; previous release preserved. Staging: ${staging ?? 'not created'}`,
  );
  throw error;
} finally {
  await rm(lock, { recursive: true, force: true });
}
