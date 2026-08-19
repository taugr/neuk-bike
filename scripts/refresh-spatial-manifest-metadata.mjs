// Run `node scripts/refresh-spatial-manifest-metadata.mjs` to backfill
// manifest metadata without downloading or rewriting generated records.
// Every chunk must retain its content-addressed checksum and recorded count.
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createCycleNetworkManifestReleaseId } from './cycle-network-data-utils.mjs';
import { createManifestReleaseId } from './parking-data-utils.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const datasets = [
  { directory: 'public/data/parking', hasPointIndex: true },
  { directory: 'public/data/cycling-pois', hasPointIndex: true },
  { directory: 'public/data/cycle-network', hasPointIndex: false },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifyChunk({ content, directory, key, metadata }) {
  const expectedHash = metadata.path.match(/\.([a-f0-9]{16})\.json$/)?.[1];
  const actualHash = createHash('sha256')
    .update(content)
    .digest('hex')
    .slice(0, 16);
  assert(
    expectedHash === actualHash,
    `${directory} chunk ${key} is not content-addressed correctly.`,
  );
  const chunk = JSON.parse(content);
  const records = chunk.points ?? chunk.features;
  assert(
    Array.isArray(records) && records.length === metadata.count,
    `${directory} chunk ${key} count does not match the manifest.`,
  );
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    if (entry.isFile()) files.push(path);
  }
  return files;
}

function maximumBufferedCompressedBytes(chunkContents) {
  let maximum = 0;
  for (const key of chunkContents.keys()) {
    const [zoom, x, y] = key.split('/').map(Number);
    let total = 0;
    for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        const content = chunkContents.get(
          `${zoom}/${x + xOffset}/${y + yOffset}`,
        );
        if (content) total += gzipSync(content).byteLength;
      }
    }
    maximum = Math.max(maximum, total);
  }
  return maximum;
}

async function refreshDataset({ directory, hasPointIndex }) {
  const dataRoot = resolve(repoRoot, directory);
  const manifestPath = resolve(dataRoot, 'manifest.json');
  const reportPath = resolve(
    repoRoot,
    `src/data/${
      directory.endsWith('parking')
        ? 'cycle-parking'
        : directory.endsWith('cycling-pois')
          ? 'cycling-poi'
          : 'cycle-network'
    }-report.json`,
  );
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert(
    manifest && typeof manifest === 'object' && manifest.chunks,
    `${directory} does not contain a chunk manifest.`,
  );

  const chunks = {};
  const chunkContents = new Map();
  for (const [key, metadata] of Object.entries(manifest.chunks)) {
    assert(
      metadata && typeof metadata.path === 'string',
      `${directory} chunk ${key} has no path.`,
    );
    const chunkPath = resolve(dataRoot, metadata.path);
    assert(
      relative(dataRoot, chunkPath).startsWith('chunks/'),
      `${directory} chunk ${key} resolves outside chunks/.`,
    );
    const content = await readFile(chunkPath, 'utf8');
    verifyChunk({ content, directory, key, metadata });
    chunks[key] = { ...metadata, byteLength: Buffer.byteLength(content) };
    chunkContents.set(key, content);
  }

  const releaseId =
    directory === 'public/data/cycle-network'
      ? createCycleNetworkManifestReleaseId({
          chunks,
          recordCount: manifest.recordCount,
        })
      : createManifestReleaseId({
          chunkZoom: manifest.chunkZoom,
          chunks,
          pointIndexPath: hasPointIndex ? manifest.pointIndexPath : undefined,
          recordCount: manifest.recordCount,
          schemaVersion: manifest.schemaVersion,
        });
  const refreshedManifest = { ...manifest, chunks, releaseId };
  await writeFile(manifestPath, `${JSON.stringify(refreshedManifest)}\n`);

  const files = await listFiles(dataRoot);
  const fileSizes = await Promise.all(files.map((path) => stat(path)));
  const manifestBytes = (await stat(manifestPath)).size;
  const pointIndexBytes = hasPointIndex
    ? (await stat(resolve(dataRoot, refreshedManifest.pointIndexPath))).size
    : undefined;
  const totalBytes = fileSizes.reduce(
    (total, details) => total + details.size,
    0,
  );
  const largestAssetBytes = Math.max(
    ...fileSizes.map((details) => details.size),
  );
  const maximumCompressedBytes = maximumBufferedCompressedBytes(chunkContents);
  if (directory.endsWith('parking')) {
    report.generatedAssets = {
      ...report.generatedAssets,
      fileCount: files.length,
      largestAssetBytes,
      manifestBytes,
      maximumInitialCompressedBytes: maximumCompressedBytes,
      parkingDataBytes: totalBytes,
      pointIndexBytes,
    };
    report.releaseId = releaseId;
  } else if (directory.endsWith('cycling-pois')) {
    Object.assign(report, refreshedManifest, {
      chunkCount: Object.keys(chunks).length,
      generatedAssets: {
        ...report.generatedAssets,
        cyclingPoiDataBytes: totalBytes,
        fileCount: files.length,
        largestAssetBytes,
        manifestBytes,
        maximumInitialCompressedBytes: maximumCompressedBytes,
        pointIndexBytes,
      },
    });
  } else {
    Object.assign(report, refreshedManifest, {
      generatedAssets: {
        ...report.generatedAssets,
        fileCount: files.length,
        largestAssetBytes,
        manifestBytes,
        maximumBufferedCompressedBytes: maximumCompressedBytes,
        totalBytes,
      },
    });
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Refreshed metadata for ${directory}: ${releaseId}`);
}

for (const dataset of datasets) await refreshDataset(dataset);
