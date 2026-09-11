import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { osmInputs } from './parking-data-sources.mjs';
import { summarizeSourceDates } from './data-release-utils.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = process.env.NEUK_DATA_ROOT
  ? resolve(process.env.NEUK_DATA_ROOT)
  : sourceRoot;
const cacheRoot = process.env.NEUK_DATA_CACHE_ROOT
  ? resolve(process.env.NEUK_DATA_CACHE_ROOT)
  : resolve(sourceRoot, '.cache');
const expectedIds = osmInputs.map((input) => input.id);
const readJson = async (path) =>
  JSON.parse(await readFile(resolve(root, path), 'utf8'));
const retrievalDates = new Map();

async function verifiedRetrievalDate(input) {
  if (input.retrievedAt) return input.retrievedAt;
  if (retrievalDates.has(input.pbfSha256))
    return retrievalDates.get(input.pbfSha256);
  try {
    const path = resolve(cacheRoot, `${input.id}-latest.osm.pbf`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    const date =
      hash.digest('hex') === input.pbfSha256
        ? (await stat(path)).mtime.toISOString()
        : null;
    retrievalDates.set(input.pbfSha256, date);
    return date;
  } catch {
    return null;
  }
}

export async function writeDataFreshness() {
  const parking = await readJson('src/data/cycle-parking-report.json');
  const council = await readJson('src/data/cycle-parking.json');
  const pois = await readJson('src/data/cycling-poi-report.json');
  const network = await readJson('src/data/cycle-network-report.json');
  const datasets = [];
  for (const [id, label, report, reportInputs] of [
    ['parking', 'Cycle parking', parking, parking.osm.inputs],
    ['cycling-pois', 'Cycling places', pois, pois.inputs],
  ]) {
    const inputs = [];
    for (const input of reportInputs)
      inputs.push({
        id: input.id,
        sourceUrl: input.sourceUrl,
        sourceTimestamp: input.sourceTimestamp,
        sha256: input.pbfSha256,
        retrievedAt: await verifiedRetrievalDate(input),
      });
    datasets.push({
      id,
      label,
      releaseId: report.releaseId,
      refreshedAt: report.refreshedAt,
      ...summarizeSourceDates(inputs, expectedIds),
      inputs,
    });
  }
  const inputs = [
    {
      id: 'ncn',
      sourceTimestamp: network.source.dataEditedAt,
      sourceUrl: network.source.layerUrl,
      sha256: network.source.sourceChecksum,
      retrievedAt: network.refreshedAt,
    },
  ];
  datasets.push({
    id: 'cycle-network',
    label: 'National Cycle Network',
    releaseId: network.releaseId,
    refreshedAt: network.refreshedAt,
    ...summarizeSourceDates(inputs, ['ncn']),
    inputs,
  });
  const poiHashes = new Map(
    pois.inputs.map((input) => [input.id, input.pbfSha256]),
  );
  const osmInputsMatch =
    parking.osm.inputs.length === pois.inputs.length &&
    parking.osm.inputs.every(
      (input) => poiHashes.get(input.id) === input.pbfSha256,
    );
  const freshness = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    osmInputsMatch,
    council: {
      sourceUrl: council.metadata.sourceUrl,
      retrievedAt: council.metadata.refreshedAt,
      sourceTimestamp: null,
      note: 'Council feed retrieval date; underlying edit date is not supplied by the snapshot.',
    },
    datasets,
  };
  await mkdir(resolve(root, 'public/data'), { recursive: true });
  await writeFile(
    resolve(root, 'public/data/freshness.json'),
    JSON.stringify(freshness, null, 2) + '\n',
  );
  const summary = {
    ...freshness,
    datasets: datasets.map(({ inputs: _inputs, ...dataset }) => dataset),
  };
  await writeFile(
    resolve(root, 'src/data/data-freshness-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
  );
  return freshness;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await writeDataFreshness();
