import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  CYCLE_NETWORK_CHUNK_ZOOM,
  CYCLE_NETWORK_LIGHTING,
  CYCLE_NETWORK_QUALITIES,
  CYCLE_NETWORK_SCHEMA_VERSION,
  CYCLE_NETWORK_SURFACES,
  getCycleNetworkTileKeys,
} from './cycle-network-data-utils.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = resolve(repoRoot, 'public/data/cycle-network');
const reportPath = resolve(repoRoot, 'src/data/cycle-network-report.json');
const mebibyte = 1_048_576;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256Content(content) {
  return createHash('sha256').update(content).digest('hex');
}

function verifyContentHash(path, content) {
  const match = path.match(/\.([a-f0-9]{16})\.json$/);
  assert(match, `Generated chunk path is not content-addressed: ${path}`);
  assert(
    sha256Content(content).startsWith(match[1]),
    `Generated chunk content hash does not match its path: ${path}`,
  );
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) paths.push(...(await listFiles(path)));
    if (entry.isFile()) paths.push(path);
  }
  return paths;
}

async function main() {
  const manifestContent = await readFile(
    resolve(dataRoot, 'manifest.json'),
    'utf8',
  );
  const manifest = JSON.parse(manifestContent);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert(
    manifest.schemaVersion === CYCLE_NETWORK_SCHEMA_VERSION,
    'Manifest schema is unsupported.',
  );
  assert(
    report.schemaVersion === CYCLE_NETWORK_SCHEMA_VERSION,
    'Report schema is unsupported.',
  );
  assert(
    manifest.chunkZoom === CYCLE_NETWORK_CHUNK_ZOOM,
    'Unexpected chunk zoom.',
  );
  assert(
    manifest.recordCount >= 30_000,
    'Network record count is unexpectedly low.',
  );
  assert(
    manifest.source?.licenceName === 'Open Government Licence v3.0',
    'OGL attribution is missing.',
  );
  assert(
    manifest.source?.attribution.includes('Ordnance Survey'),
    'Ordnance Survey attribution is missing.',
  );
  assert(
    manifest.source?.attribution.includes('OpenStreetMap'),
    'Northern Ireland OSM attribution is missing.',
  );

  const seenFeatures = new Map();
  const chunkContents = new Map();
  let featureCopies = 0;
  let totalBytes = Buffer.byteLength(manifestContent);
  let largestAssetBytes = Buffer.byteLength(manifestContent);

  for (const [key, metadata] of Object.entries(manifest.chunks)) {
    const content = await readFile(resolve(dataRoot, metadata.path), 'utf8');
    verifyContentHash(metadata.path, content);
    const chunk = JSON.parse(content);
    assert(
      chunk.schemaVersion === CYCLE_NETWORK_SCHEMA_VERSION,
      `Chunk ${key} schema is unsupported.`,
    );
    assert(chunk.key === key, `Chunk ${key} reports the wrong key.`);
    assert(
      chunk.features.length === metadata.count,
      `Chunk ${key} count does not match its manifest entry.`,
    );
    const bytes = Buffer.byteLength(content);
    totalBytes += bytes;
    largestAssetBytes = Math.max(largestAssetBytes, bytes);
    chunkContents.set(key, content);
    for (const feature of chunk.features) {
      featureCopies += 1;
      assert(
        !feature.properties.surface ||
          CYCLE_NETWORK_SURFACES.has(feature.properties.surface),
        `Feature ${feature.id} has an unsupported surface.`,
      );
      assert(
        !feature.properties.quality ||
          CYCLE_NETWORK_QUALITIES.has(feature.properties.quality),
        `Feature ${feature.id} has an unsupported quality.`,
      );
      assert(
        !feature.properties.lighting ||
          CYCLE_NETWORK_LIGHTING.has(feature.properties.lighting),
        `Feature ${feature.id} has unsupported lighting.`,
      );
      const existing = seenFeatures.get(feature.id);
      if (existing) {
        assert(
          JSON.stringify(existing) === JSON.stringify(feature),
          `Feature ${feature.id} differs between chunks.`,
        );
      } else {
        seenFeatures.set(feature.id, feature);
      }
      assert(
        getCycleNetworkTileKeys(feature).includes(key),
        `Feature ${feature.id} does not intersect chunk ${key}.`,
      );
    }
  }

  assert(
    seenFeatures.size === manifest.recordCount,
    'Unique feature count does not match the manifest.',
  );
  assert(
    report.recordCount === manifest.recordCount,
    'Report count does not match the manifest.',
  );
  assert(
    report.generatedAssets.featureCopies === featureCopies,
    'Feature copy count does not match the report.',
  );
  assert(
    report.generatedAssets.totalBytes === totalBytes,
    'Generated byte count does not match the report.',
  );
  assert(
    largestAssetBytes <= mebibyte,
    'A generated network asset exceeds 1 MiB.',
  );

  let maximumBufferedCompressedBytes = 0;
  for (const key of chunkContents.keys()) {
    const [zoom, x, y] = key.split('/').map(Number);
    let compressedBytes = 0;
    for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        const content = chunkContents.get(
          `${zoom}/${x + xOffset}/${y + yOffset}`,
        );
        if (content) compressedBytes += gzipSync(content).byteLength;
      }
    }
    maximumBufferedCompressedBytes = Math.max(
      maximumBufferedCompressedBytes,
      compressedBytes,
    );
  }
  assert(
    maximumBufferedCompressedBytes ===
      report.generatedAssets.maximumBufferedCompressedBytes,
    'Buffered compressed payload does not match the report.',
  );
  assert(
    maximumBufferedCompressedBytes <= mebibyte,
    'A buffered viewport exceeds 1 MiB compressed.',
  );

  const files = await listFiles(dataRoot);
  assert(
    files.length === Object.keys(manifest.chunks).length + 1,
    'Unexpected generated network files exist.',
  );
  for (const path of files)
    assert((await stat(path)).isFile(), `Expected a file: ${path}`);
  console.log(
    `Verified ${manifest.recordCount.toLocaleString('en-GB')} network features across ${Object.keys(manifest.chunks).length.toLocaleString('en-GB')} chunks.`,
  );
}

await main();
