import { createHash } from 'node:crypto';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  CYCLE_NETWORK_CHUNK_ZOOM,
  CYCLE_NETWORK_SCHEMA_VERSION,
  getCycleNetworkFeatureBounds,
  getCycleNetworkTileKeys,
  normalizeCycleNetworkFeature,
  summarizeCycleNetworkFeatures,
} from './cycle-network-data-utils.mjs';
import { getTileBounds } from './parking-data-utils.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = resolve(repoRoot, 'public/data/cycle-network');
const temporaryRoot = resolve(repoRoot, 'public/data/cycle-network.next');
const previousRoot = resolve(repoRoot, 'public/data/cycle-network.previous');
const reportPath = resolve(repoRoot, 'src/data/cycle-network-report.json');
const itemId = '5defd254e78745bfb12d0456abc1bcf1';
const itemUrl = `https://www.arcgis.com/sharing/rest/content/items/${itemId}`;
const layerUrl =
  'https://services5.arcgis.com/1ZHcUS1lwPTg4ms0/arcgis/rest/services/National_Cycle_Network_Public/FeatureServer/0';
const queryUrl = `${layerUrl}/query`;
const licenceUrl =
  'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';
const requestedFields = [
  'FID',
  'Desc_',
  'GlobalID',
  'Greenway',
  'Lighting',
  'LinkNo',
  'OpenStatus',
  'Quality',
  'RoadClass',
  'RouteCat',
  'RouteNo',
  'RouteType',
  'SegmentID',
  'Surface',
];
const pageSize = 2_000;
const maximumAttempts = 4;
const mebibyte = 1_048_576;

function sha256Content(content) {
  return createHash('sha256').update(content).digest('hex');
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchJson(url, label) {
  let lastError;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok)
        throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < maximumAttempts) {
        await new Promise((resolvePromise) =>
          setTimeout(resolvePromise, attempt * 500),
        );
      }
    }
  }
  throw new Error(`${label} failed after ${maximumAttempts} attempts.`, {
    cause: lastError,
  });
}

function query(parameters) {
  const url = new URL(queryUrl);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function fetchSource() {
  const [item, layer, countResult] = await Promise.all([
    fetchJson(new URL(`${itemUrl}?f=json`), 'Dataset item metadata'),
    fetchJson(new URL(`${layerUrl}?f=json`), 'Feature layer metadata'),
    fetchJson(
      query({ f: 'json', returnCountOnly: true, where: '1=1' }),
      'Feature count',
    ),
  ]);
  assert(item.id === itemId, 'The dataset item ID changed unexpectedly.');
  assert(
    layer.geometryType === 'esriGeometryPolyline',
    'Expected a polyline layer.',
  );
  assert(layer.objectIdField === 'FID', 'Expected FID as the object ID field.');
  assert(Number.isInteger(countResult.count), 'The source count is invalid.');
  const availableFields = new Set(layer.fields?.map(({ name }) => name));
  for (const field of requestedFields) {
    assert(
      availableFields.has(field),
      `Required source field is missing: ${field}`,
    );
  }

  const pages = [];
  for (let offset = 0; offset < countResult.count; offset += pageSize) {
    console.log(
      `Downloading network features ${offset + 1}-${Math.min(offset + pageSize, countResult.count)} of ${countResult.count}`,
    );
    const page = await fetchJson(
      query({
        f: 'geojson',
        orderByFields: 'FID',
        outFields: requestedFields.join(','),
        outSR: 4326,
        resultOffset: offset,
        resultRecordCount: pageSize,
        returnGeometry: true,
        where: '1=1',
      }),
      `Feature page at offset ${offset}`,
    );
    assert(Array.isArray(page.features), `Feature page ${offset} is invalid.`);
    pages.push(...page.features);
  }
  assert(
    pages.length === countResult.count,
    `Downloaded ${pages.length} features but the source reports ${countResult.count}.`,
  );
  return { count: countResult.count, item, layer, pages };
}

function overallBounds(features) {
  return features.reduce(
    (bounds, feature) => {
      const featureBounds = getCycleNetworkFeatureBounds(feature);
      return {
        east: Math.max(bounds.east, featureBounds.east),
        north: Math.max(bounds.north, featureBounds.north),
        south: Math.min(bounds.south, featureBounds.south),
        west: Math.min(bounds.west, featureBounds.west),
      };
    },
    { east: -Infinity, north: -Infinity, south: Infinity, west: Infinity },
  );
}

function maximumBufferedCompressedBytes(contents) {
  let maximum = 0;
  for (const key of contents.keys()) {
    const [zoom, x, y] = key.split('/').map(Number);
    let total = 0;
    for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        const content = contents.get(`${zoom}/${x + xOffset}/${y + yOffset}`);
        if (content) total += gzipSync(content).byteLength;
      }
    }
    maximum = Math.max(maximum, total);
  }
  return maximum;
}

function assertBudgets(metrics) {
  const failures = [];
  if (metrics.fileCount > 1_000) failures.push('file count exceeds 1,000');
  if (metrics.totalBytes > 50 * mebibyte)
    failures.push('total data exceeds 50 MiB');
  if (metrics.largestAssetBytes > mebibyte)
    failures.push('a chunk exceeds 1 MiB');
  if (metrics.manifestBytes > 512 * 1_024)
    failures.push('manifest exceeds 512 KiB');
  if (metrics.maximumBufferedCompressedBytes > mebibyte) {
    failures.push('a buffered 3x3 viewport exceeds 1 MiB compressed');
  }
  if (metrics.duplicationRatio > 2)
    failures.push('duplication ratio exceeds 2.0');
  if (failures.length > 0) {
    throw new Error(
      `Cycle network generated asset budget failed: ${failures.join('; ')}`,
    );
  }
}

async function replaceOutput() {
  await rm(previousRoot, { force: true, recursive: true });
  try {
    await rename(outputRoot, previousRoot);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  try {
    await rename(temporaryRoot, outputRoot);
    await rm(previousRoot, { force: true, recursive: true });
  } catch (error) {
    try {
      await rename(previousRoot, outputRoot);
    } catch {
      // Preserve the original failure; a previous output may not have existed.
    }
    throw error;
  }
}

async function main() {
  const startedAt = performance.now();
  const refreshedAt = new Date().toISOString();
  const source = await fetchSource();
  const features = [];
  const invalidFeatures = [];
  const ids = new Set();

  for (const feature of source.pages) {
    const normalized = normalizeCycleNetworkFeature(feature);
    if (!normalized) {
      invalidFeatures.push(feature?.properties?.FID ?? null);
      continue;
    }
    assert(
      !ids.has(normalized.id),
      `Duplicate stable feature ID: ${normalized.id}`,
    );
    ids.add(normalized.id);
    features.push(normalized);
  }
  assert(
    invalidFeatures.length === 0,
    `Invalid source features: ${invalidFeatures.slice(0, 20).join(', ')}`,
  );
  features.sort((left, right) => left.id.localeCompare(right.id));

  const chunks = new Map();
  let featureCopies = 0;
  for (const feature of features) {
    for (const key of getCycleNetworkTileKeys(feature)) {
      const chunk = chunks.get(key) ?? { features: [] };
      chunk.features.push(feature);
      featureCopies += 1;
      chunks.set(key, chunk);
    }
  }

  await rm(temporaryRoot, { force: true, recursive: true });
  await mkdir(temporaryRoot, { recursive: true });
  const chunkManifest = {};
  const chunkContents = new Map();
  let totalBytes = 0;
  let largestAssetBytes = 0;

  for (const [key, chunk] of [...chunks.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    chunk.features.sort((left, right) => left.id.localeCompare(right.id));
    const content = json({
      features: chunk.features,
      key,
      schemaVersion: CYCLE_NETWORK_SCHEMA_VERSION,
    });
    const contentHash = sha256Content(content).slice(0, 16);
    const path = `chunks/${key}.${contentHash}.json`;
    await mkdir(dirname(resolve(temporaryRoot, path)), { recursive: true });
    await writeFile(resolve(temporaryRoot, path), content);
    const bytes = Buffer.byteLength(content);
    totalBytes += bytes;
    largestAssetBytes = Math.max(largestAssetBytes, bytes);
    chunkContents.set(key, content);
    chunkManifest[key] = {
      bounds: getTileBounds(key),
      count: chunk.features.length,
      path,
    };
  }

  const summary = summarizeCycleNetworkFeatures(features);
  const normalizedContent = json(features);
  const manifest = {
    chunkZoom: CYCLE_NETWORK_CHUNK_ZOOM,
    chunks: chunkManifest,
    coverage: { bounds: overallBounds(features), label: 'United Kingdom' },
    recordCount: features.length,
    refreshedAt,
    schemaVersion: CYCLE_NETWORK_SCHEMA_VERSION,
    source: {
      attribution:
        'Walk Wheel Cycle Trust (formerly Sustrans) National Cycle Network data contains Ordnance Survey data © Crown copyright and database rights (2018). Contains © OpenStreetMap contributors in Northern Ireland.',
      dataEditedAt: source.layer.editingInfo?.dataLastEditDate
        ? new Date(source.layer.editingInfo.dataLastEditDate).toISOString()
        : null,
      itemId,
      itemModifiedAt: source.item.modified
        ? new Date(source.item.modified).toISOString()
        : null,
      itemUrl: `https://www.arcgis.com/home/item.html?id=${itemId}`,
      label: 'National Cycle Network',
      layerUrl,
      licenceName: 'Open Government Licence v3.0',
      licenceUrl,
      publisher: 'Walk Wheel Cycle Trust (formerly Sustrans)',
      sourceChecksum: sha256Content(normalizedContent),
    },
    summary,
  };
  const manifestContent = json(manifest);
  await writeFile(resolve(temporaryRoot, 'manifest.json'), manifestContent);
  const manifestBytes = Buffer.byteLength(manifestContent);
  totalBytes += manifestBytes;
  largestAssetBytes = Math.max(largestAssetBytes, manifestBytes);
  const metrics = {
    duplicationRatio: Number((featureCopies / features.length).toFixed(3)),
    featureCopies,
    fileCount: chunks.size + 1,
    largestAssetBytes,
    manifestBytes,
    maximumBufferedCompressedBytes:
      maximumBufferedCompressedBytes(chunkContents),
    totalBytes,
  };
  assertBudgets(metrics);
  await replaceOutput();

  const report = {
    ...manifest,
    elapsedSeconds: Number(
      ((performance.now() - startedAt) / 1_000).toFixed(1),
    ),
    generatedAssets: metrics,
    pageCount: Math.ceil(source.count / pageSize),
    sourceRecordCount: source.count,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const outputStat = await stat(outputRoot);
  assert(outputStat.isDirectory(), 'Generated output directory is missing.');
  console.log(
    `Generated ${features.length.toLocaleString('en-GB')} network features across ${chunks.size.toLocaleString('en-GB')} chunks.`,
  );
  console.log(
    `Largest asset ${metrics.largestAssetBytes.toLocaleString('en-GB')} bytes; maximum buffered payload ${metrics.maximumBufferedCompressedBytes.toLocaleString('en-GB')} compressed bytes.`,
  );
}

await main();
