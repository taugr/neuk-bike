import { execFileSync, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFreshOsmRelease,
  promoteStagedPaths,
} from './data-release-utils.mjs';

import {
  createPublicationPlan,
  openPublicationPlan,
} from './publication-plan.mjs';
import { checkDataFreshness } from './check-data-freshness.mjs';

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
  const selected = selection === 'all' ? Object.keys(definitions) : [selection];
  let planEnv = {};
  let publicationPlan;
  const review = resolve(cache, 'review');
  if (selected.some((id) => id !== 'network') && !args.includes('--cached')) {
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    const { plan, context } = await createPublicationPlan(revision);
    const planPath = resolve(staging, 'publication-plan.json');
    await writeFile(planPath, JSON.stringify(plan, null, 2) + '\n');
    planEnv = {
      NEUK_PUBLICATION_PLAN: planPath,
      NEUK_PLAN_INVOCATION: context.invocationId,
      NEUK_PLAN_REVISION: context.codeRevision,
      NEUK_PLAN_DIGEST: context.digest,
    };
    publicationPlan = await openPublicationPlan(planEnv);
    await mkdir(review, { recursive: true });
    await cp(planPath, resolve(review, 'publication-plan.json'));
    console.log(
      `Pinned ${plan.sources.length} dated publications for invocation ${plan.invocationId}; expires ${plan.expiresAt}`,
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
            ...planEnv,
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
  assertFreshOsmRelease(
    freshness.datasets.filter(
      (dataset) =>
        ['parking', 'cycling-pois'].includes(dataset.id) &&
        selected.includes(dataset.id === 'cycling-pois' ? 'pois' : dataset.id),
    ),
  );
  if (publicationPlan) {
    const plan = await publicationPlan.assertRelease(
      freshness,
      selected
        .filter((id) => id !== 'network')
        .map((id) => (id === 'pois' ? 'cycling-pois' : id)),
    );
    const status = await checkDataFreshness(freshness);
    const selectedIds = selected.map((id) =>
      id === 'pois' ? 'cycling-pois' : id === 'network' ? 'cycle-network' : id,
    );
    if (
      status.datasets
        .filter((item) => selectedIds.includes(item.id))
        .some((item) => item.stale || !item.complete || item.mixedAge) ||
      (selection === 'all' && !status.osmInputsMatch)
    )
      throw new Error(
        'Release source checks failed; release was not promoted.',
      );
    status.mode = 'pinned-release';
    status.publicationPlanId = plan.invocationId;
    status.preflightStartedAt = plan.createdAt;
    status.upstream = plan.sources.map((source) => ({
      id: source.id,
      downloadUrl: source.datedUrl,
      sourceTimestamp: source.sourceTimestamp,
      bytes: source.bytes,
      validatedAt: source.validatedAt,
      publishedAt: source.publishedAt,
    }));
    // NCN provenance comes from the actual release (acquired in an all refresh).
    status.upstream.push(
      ...freshness.datasets
        .filter((item) => item.id === 'cycle-network')
        .flatMap((item) =>
          item.inputs.map((input) => ({
            id: input.id,
            dataEditedAt: input.sourceTimestamp,
          })),
        ),
    );
    await writeFile(
      resolve(cache, 'source-status.json'),
      JSON.stringify(status, null, 2) + '\n',
    );
    await writeFile(
      resolve(review, 'publication-receipts.json'),
      JSON.stringify(await publicationPlan.receipts(), null, 2) + '\n',
    );
  }
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
