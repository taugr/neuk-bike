import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parkingRoot = resolve(repoRoot, 'public/data/parking');
const manifestPath = resolve(parkingRoot, 'manifest.json');
const reportPath = resolve(repoRoot, 'src/data/cycle-parking-report.json');
const mebibyte = 1_048_576;

function sha256Content(content) {
  return createHash('sha256').update(content).digest('hex');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isPointInRing(location, coordinates) {
  let inside = false;
  for (
    let current = 0, previous = coordinates.length - 1;
    current < coordinates.length;
    previous = current, current += 1
  ) {
    const [currentLongitude, currentLatitude] = coordinates[current];
    const [previousLongitude, previousLatitude] = coordinates[previous];
    const crossesLatitude =
      currentLatitude > location.latitude !==
      previousLatitude > location.latitude;
    if (!crossesLatitude) {
      continue;
    }
    const boundaryLongitude =
      ((previousLongitude - currentLongitude) *
        (location.latitude - currentLatitude)) /
        (previousLatitude - currentLatitude) +
      currentLongitude;
    if (location.longitude < boundaryLongitude) {
      inside = !inside;
    }
  }
  return inside;
}

function isCovered(location, manifest) {
  return manifest.coverage.areas.some((area) => {
    const { bounds } = area;
    if (
      location.latitude < bounds.south ||
      location.latitude > bounds.north ||
      location.longitude < bounds.west ||
      location.longitude > bounds.east
    ) {
      return false;
    }
    return (
      area.rings.some(
        (ring) => !ring.exclude && isPointInRing(location, ring.coordinates),
      ) &&
      !area.rings.some(
        (ring) => ring.exclude && isPointInRing(location, ring.coordinates),
      )
    );
  });
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await listFiles(path)));
    } else if (entry.isFile()) {
      paths.push(path);
    }
  }
  return paths;
}

function verifyContentHash(path, content) {
  const match = path.match(/\.([a-f0-9]{16})\.json$/);
  assert(match, `Generated asset path is not content-addressed: ${path}`);
  assert(
    sha256Content(content).startsWith(match[1]),
    `Generated asset content hash does not match its path: ${path}`,
  );
}

function maximumInitialCompressedBytes(chunkContents) {
  let maximum = 0;
  for (const key of chunkContents.keys()) {
    const [zoom, x, y] = key.split('/').map(Number);
    let total = 0;
    for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        const content = chunkContents.get(
          `${zoom}/${x + xOffset}/${y + yOffset}`,
        );
        if (content) {
          total += gzipSync(content).byteLength;
        }
      }
    }
    maximum = Math.max(maximum, total);
  }
  return maximum;
}

async function main() {
  const manifestContent = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestContent);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert(manifest.schemaVersion === 2, 'Manifest schema must be version 2.');
  assert(report.schemaVersion === 2, 'Report schema must be version 2.');
  assert(
    manifest.coverage.label === 'UK and Ireland',
    'Coverage label must describe the UK and Ireland.',
  );
  assert(
    manifest.coverage.areas
      .map((area) => area.id)
      .sort()
      .join(',') === 'england,ireland-and-northern-ireland,scotland,wales',
    'Coverage must contain England, Scotland, Wales, and Ireland areas.',
  );

  const pointIndexContent = await readFile(
    resolve(parkingRoot, manifest.pointIndexPath),
    'utf8',
  );
  verifyContentHash(manifest.pointIndexPath, pointIndexContent);
  const pointIndex = JSON.parse(pointIndexContent);
  const ids = new Set();
  const chunkContents = new Map();
  let pointCount = 0;
  let largestAssetBytes = Math.max(
    Buffer.byteLength(manifestContent),
    Buffer.byteLength(pointIndexContent),
  );

  for (const [key, metadata] of Object.entries(manifest.chunks)) {
    const content = await readFile(resolve(parkingRoot, metadata.path), 'utf8');
    verifyContentHash(metadata.path, content);
    const chunk = JSON.parse(content);
    assert(chunk.schemaVersion === 2, `Chunk ${key} has the wrong schema.`);
    assert(chunk.key === key, `Chunk ${key} reports a different key.`);
    assert(
      chunk.points.length === metadata.count,
      `Chunk ${key} count does not match the manifest.`,
    );
    chunkContents.set(key, content);
    largestAssetBytes = Math.max(largestAssetBytes, Buffer.byteLength(content));
    pointCount += chunk.points.length;
    for (const point of chunk.points) {
      assert(!ids.has(point.id), `Duplicate generated point ID: ${point.id}`);
      ids.add(point.id);
      assert(
        pointIndex[point.id] === key,
        `Point index does not resolve ${point.id} to ${key}.`,
      );
    }
  }

  assert(pointCount === manifest.recordCount, 'Manifest point total is wrong.');
  assert(
    ids.size === manifest.recordCount,
    'Generated point IDs are not unique.',
  );
  assert(
    Object.keys(pointIndex).length === manifest.recordCount,
    'Point index count does not match the manifest.',
  );
  assert(
    report.mergedRecordCount === manifest.recordCount,
    'Quality report count does not match the manifest.',
  );

  const representativeInside = {
    Edinburgh: { latitude: 55.9533, longitude: -3.1883 },
    London: { latitude: 51.5072, longitude: -0.1276 },
    Manchester: { latitude: 53.4808, longitude: -2.2426 },
    Newcastle: { latitude: 54.9783, longitude: -1.6178 },
    Cardiff: { latitude: 51.4816, longitude: -3.1791 },
    Belfast: { latitude: 54.5973, longitude: -5.9301 },
    Dublin: { latitude: 53.3498, longitude: -6.2603 },
  };
  const representativeOutside = {
    Douglas: { latitude: 54.1523, longitude: -4.4861 },
    Jersey: { latitude: 49.2144, longitude: -2.1313 },
    Cherbourg: { latitude: 49.6337, longitude: -1.6221 },
  };
  for (const [label, location] of Object.entries(representativeInside)) {
    assert(isCovered(location, manifest), `${label} must be inside coverage.`);
  }
  for (const [label, location] of Object.entries(representativeOutside)) {
    assert(
      !isCovered(location, manifest),
      `${label} must be outside coverage.`,
    );
  }

  const files = await listFiles(parkingRoot);
  const fileSizes = await Promise.all(files.map((path) => stat(path)));
  const parkingDataBytes = fileSizes.reduce(
    (total, details) => total + details.size,
    0,
  );
  const maximumInitialBytes = maximumInitialCompressedBytes(chunkContents);
  assert(files.length <= 15_000, 'Parking file count exceeds 15,000.');
  assert(parkingDataBytes <= 75 * mebibyte, 'Parking data exceeds 75 MiB.');
  assert(largestAssetBytes <= 20 * mebibyte, 'An asset exceeds 20 MiB.');
  assert(
    Buffer.byteLength(manifestContent) <= mebibyte,
    'Manifest exceeds 1 MiB.',
  );
  assert(
    Buffer.byteLength(pointIndexContent) <= 5 * mebibyte,
    'Point index exceeds 5 MiB.',
  );
  assert(maximumInitialBytes <= mebibyte, 'Initial payload exceeds 1 MiB.');

  console.log(
    JSON.stringify(
      {
        chunkCount: Object.keys(manifest.chunks).length,
        fileCount: files.length,
        largestAssetBytes,
        maximumInitialCompressedBytes: maximumInitialBytes,
        parkingDataBytes,
        recordCount: manifest.recordCount,
      },
      null,
      2,
    ),
  );
}

await main();
