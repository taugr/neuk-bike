import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  coverageInputs,
  coverageLabel,
  osmInputs,
} from './parking-data-sources.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = resolve(repoRoot, 'public/data/cycling-pois');
const reportPath = resolve(repoRoot, 'src/data/cycling-poi-report.json');
const categories = new Set(['shop', 'repair', 'hire']);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const manifest = JSON.parse(
    await readFile(resolve(dataRoot, 'manifest.json'), 'utf8'),
  );
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  invariant(manifest.schemaVersion === 2, 'Unexpected POI manifest schema.');
  invariant(manifest.chunkZoom === 12, 'Unexpected POI chunk zoom.');
  invariant(
    Array.isArray(manifest.coverage?.areas) &&
      manifest.coverage.areas.length > 0,
    'POI coverage is missing.',
  );
  invariant(
    manifest.coverage.label === coverageLabel,
    'POI coverage label is incomplete.',
  );
  invariant(
    coverageInputs.every((input) =>
      manifest.coverage.areas.some((area) => area.id === input.id),
    ),
    'POI coverage areas are incomplete.',
  );
  invariant(
    Array.isArray(report.inputs) && report.inputs.length === osmInputs.length,
    'POI input report does not cover every configured region.',
  );
  invariant(
    report.inputs.every(
      (input) =>
        typeof input.pbfSha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(input.pbfSha256),
    ),
    'POI input checksums are incomplete.',
  );

  const ids = new Set();
  const pointIndexPath = resolve(dataRoot, manifest.pointIndexPath);
  const pointIndexContent = await readFile(pointIndexPath, 'utf8');
  const expectedPointIndexHash = manifest.pointIndexPath.match(
    /\.([a-f0-9]{16})\.json$/,
  )?.[1];
  invariant(
    expectedPointIndexHash ===
      createHash('sha256').update(pointIndexContent).digest('hex').slice(0, 16),
    'Point index content hash mismatch.',
  );
  const pointIndex = JSON.parse(pointIndexContent);
  const counts = { hire: 0, repair: 0, shop: 0 };
  let cyclingPoiDataBytes =
    Buffer.byteLength(JSON.stringify(manifest)) +
    1 +
    Buffer.byteLength(pointIndexContent);
  let largestAssetBytes = Math.max(
    Buffer.byteLength(JSON.stringify(manifest)) + 1,
    Buffer.byteLength(pointIndexContent),
  );
  let recordCount = 0;
  for (const [key, metadata] of Object.entries(manifest.chunks)) {
    const path = resolve(dataRoot, metadata.path);
    const content = await readFile(path, 'utf8');
    const contentBytes = Buffer.byteLength(content);
    cyclingPoiDataBytes += contentBytes;
    largestAssetBytes = Math.max(largestAssetBytes, contentBytes);
    const expectedHash = metadata.path.match(/\.([a-f0-9]{16})\.json$/)?.[1];
    const actualHash = createHash('sha256')
      .update(content)
      .digest('hex')
      .slice(0, 16);
    invariant(expectedHash === actualHash, `Content hash mismatch for ${key}.`);
    const chunk = JSON.parse(content);
    invariant(chunk.schemaVersion === 2, `Unexpected schema for ${key}.`);
    invariant(chunk.key === key, `Chunk key mismatch for ${key}.`);
    invariant(
      chunk.points.length === metadata.count,
      `Count mismatch for ${key}.`,
    );
    for (const point of chunk.points) {
      invariant(!ids.has(point.id), `Duplicate POI ID ${point.id}.`);
      invariant(
        pointIndex[point.id] === key,
        `Point index mismatch for ${point.id}.`,
      );
      invariant(
        Number.isFinite(point.latitude),
        `Invalid latitude for ${point.id}.`,
      );
      invariant(
        Number.isFinite(point.longitude),
        `Invalid longitude for ${point.id}.`,
      );
      invariant(point.categories.length > 0, `No category for ${point.id}.`);
      invariant(
        point.categories.every((category) => categories.has(category)),
        `Invalid category for ${point.id}.`,
      );
      ids.add(point.id);
      recordCount += 1;
      for (const category of point.categories) counts[category] += 1;
    }
  }

  invariant(
    recordCount === manifest.recordCount,
    'Manifest record count mismatch.',
  );
  invariant(
    Object.keys(pointIndex).length === manifest.recordCount,
    'Point index count mismatch.',
  );
  invariant(
    recordCount === report.recordCount,
    'Report record count mismatch.',
  );
  invariant(
    [...categories].every(
      (category) => counts[category] === manifest.categoryCounts[category],
    ),
    'Manifest category counts do not match chunks.',
  );
  invariant(
    manifest.sources.length === 1 &&
      manifest.sources[0].recordCount === recordCount,
    'Manifest source count does not match chunks.',
  );
  invariant(
    report.generatedAssets?.fileCount ===
      Object.keys(manifest.chunks).length + 2 &&
      report.generatedAssets.cyclingPoiDataBytes === cyclingPoiDataBytes &&
      report.generatedAssets.largestAssetBytes === largestAssetBytes &&
      report.generatedAssets.manifestBytes ===
        Buffer.byteLength(JSON.stringify(manifest)) + 1 &&
      report.generatedAssets.pointIndexBytes ===
        Buffer.byteLength(pointIndexContent),
    'Generated POI asset metrics do not match files.',
  );
  console.log(
    `Verified ${recordCount} cycling POIs across ${Object.keys(manifest.chunks).length} chunks.`,
  );
}

await main();
