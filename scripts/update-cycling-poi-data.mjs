import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createOSMStream } from 'osm-pbf-parser-node';
import {
  getTileBounds,
  getTileKey,
  parseGeofabrikPoly,
  representativePoint,
} from './parking-data-utils.mjs';
import {
  coverageInputs,
  coverageLabel,
  osmCatalogueUrl,
  osmInputs,
  osmLicenceUrl,
} from './parking-data-sources.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cacheRoot = resolve(repoRoot, '.cache');
const outputRoot = resolve(repoRoot, 'public/data/cycling-pois');
const temporaryRoot = resolve(repoRoot, 'public/data/cycling-pois.next');
const reportPath = resolve(repoRoot, 'src/data/cycling-poi-report.json');
const selectedTags = [
  'amenity',
  'brand',
  'fee',
  'name',
  'network',
  'opening_hours',
  'operator',
  'shop',
  'service:bicycle:pump',
  'service:bicycle:rental',
  'service:bicycle:repair',
  'service:bicycle:tools',
];

function parseArguments() {
  const args = process.argv.slice(2);
  const regionsArgument = args.find((argument) =>
    argument.startsWith('--regions='),
  );
  const requestedRegionIds = regionsArgument
    ? new Set(
        regionsArgument
          .slice('--regions='.length)
          .split(',')
          .map((region) => region.trim())
          .filter(Boolean),
      )
    : null;
  const inputs = requestedRegionIds
    ? osmInputs.filter((input) => requestedRegionIds.has(input.id))
    : osmInputs;

  if (requestedRegionIds && inputs.length !== requestedRegionIds.size) {
    const knownIds = new Set(inputs.map((input) => input.id));
    const unknownIds = [...requestedRegionIds].filter(
      (id) => !knownIds.has(id),
    );
    throw new Error(`Unknown OSM region IDs: ${unknownIds.join(', ')}`);
  }

  return {
    forceDownload: args.includes('--force-download'),
    inputs: inputs.map((input) => ({
      ...input,
      pbfPath: resolve(cacheRoot, `${input.id}-latest.osm.pbf`),
    })),
  };
}

async function downloadFile({ forceDownload, label, outputPath, url }) {
  if (!forceDownload) {
    try {
      const details = await stat(outputPath);
      if (details.size > 0) {
        console.log(`Using cached ${label} at ${outputPath}`);
        return;
      }
    } catch {
      // Download below.
    }
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.download`;
  const maximumAttempts = 4;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      await rm(temporaryPath, { force: true });
      console.log(
        `Downloading ${label} from ${url}${attempt > 1 ? ` (attempt ${attempt}/${maximumAttempts})` : ''}`,
      );
      const response = await fetch(url, {
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok || !response.body) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      await pipeline(
        Readable.fromWeb(response.body),
        createWriteStream(temporaryPath),
      );
      await rename(temporaryPath, outputPath);
      return;
    } catch (error) {
      await rm(temporaryPath, { force: true });
      if (attempt === maximumAttempts) throw error;
    }
  }
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function createResourceMonitor() {
  const startedAt = performance.now();
  let peakRssBytes = process.memoryUsage().rss;
  const timer = setInterval(() => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  }, 25);
  timer.unref();

  return {
    finish() {
      clearInterval(timer);
      peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
      return {
        elapsedSeconds: Number(
          ((performance.now() - startedAt) / 1000).toFixed(1),
        ),
        peakRssBytes,
      };
    },
  };
}

function categoriesFor(tags = {}) {
  const categories = [];
  if (tags.shop === 'bicycle') categories.push('shop');
  if (
    tags.amenity === 'bicycle_repair_station' ||
    tags['service:bicycle:repair'] === 'yes'
  ) {
    categories.push('repair');
  }
  if (
    tags.amenity === 'bicycle_rental' ||
    tags['service:bicycle:rental'] === 'yes'
  ) {
    categories.push('hire');
  }
  return categories;
}

function displayName(tags, categories) {
  for (const value of [tags.name, tags.operator, tags.brand, tags.network]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  if (categories.includes('shop')) return 'Bicycle shop';
  if (categories.includes('repair')) return 'Bicycle repair station';
  return 'Cycle hire';
}

function propertiesFor(tags) {
  return Object.fromEntries(
    [
      ['brand', tags.brand],
      ['fee', tags.fee],
      ['network', tags.network],
      ['openingHours', tags.opening_hours],
      ['operator', tags.operator],
      ['servicePump', tags['service:bicycle:pump']],
      ['serviceRental', tags['service:bicycle:rental']],
      ['serviceRepair', tags['service:bicycle:repair']],
      ['serviceTools', tags['service:bicycle:tools']],
    ].filter(([, value]) => typeof value === 'string' && value.trim()),
  );
}

async function extractPoints(pbfPath) {
  const nodes = [];
  const ways = [];
  const relations = [];
  const requiredNodeIds = new Set();
  const relationWayIds = new Set();
  let sourceTimestamp = null;

  for await (const item of createOSMStream(pbfPath, {
    withInfo: false,
    withTags: { node: selectedTags, relation: selectedTags, way: selectedTags },
  })) {
    if (!item.type) {
      if (item.osmosis_replication_timestamp) {
        sourceTimestamp = new Date(
          item.osmosis_replication_timestamp * 1000,
        ).toISOString();
      }
      continue;
    }
    if (categoriesFor(item.tags).length === 0) continue;
    if (item.type === 'node') nodes.push(item);
    if (item.type === 'way') {
      ways.push(item);
      for (const ref of item.refs ?? []) requiredNodeIds.add(ref);
    }
    if (item.type === 'relation') {
      relations.push(item);
      for (const member of item.members ?? []) {
        if (member.type === 'node') requiredNodeIds.add(member.ref);
        if (member.type === 'way') relationWayIds.add(member.ref);
      }
    }
  }

  const relationWays = new Map();
  if (relationWayIds.size > 0) {
    for await (const item of createOSMStream(pbfPath, {
      withInfo: false,
      withTags: false,
    })) {
      if (item.type !== 'way' || !relationWayIds.has(item.id)) continue;
      relationWays.set(item.id, item.refs ?? []);
      for (const ref of item.refs ?? []) requiredNodeIds.add(ref);
    }
  }

  const coordinates = new Map(
    nodes.map((node) => [node.id, { latitude: node.lat, longitude: node.lon }]),
  );
  if (requiredNodeIds.size > 0) {
    for await (const item of createOSMStream(pbfPath, {
      withInfo: false,
      withTags: false,
    })) {
      if (item.type === 'node' && requiredNodeIds.has(item.id)) {
        coordinates.set(item.id, { latitude: item.lat, longitude: item.lon });
      }
    }
  }

  const discarded = { relation: 0, way: 0 };
  const normalize = (element, coordinate) => {
    const categories = categoriesFor(element.tags);
    return {
      categories,
      id: `osm:${element.type}:${element.id}`,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      name: displayName(element.tags ?? {}, categories),
      properties: propertiesFor(element.tags ?? {}),
      sourceId: 'osm',
    };
  };
  const points = nodes.map((node) => normalize(node, coordinates.get(node.id)));
  for (const way of ways) {
    const coordinate = representativePoint(
      (way.refs ?? []).map((ref) => coordinates.get(ref)),
    );
    if (coordinate) points.push(normalize(way, coordinate));
    else discarded.way += 1;
  }
  for (const relation of relations) {
    const refs = (relation.members ?? []).flatMap((member) =>
      member.type === 'node'
        ? [member.ref]
        : member.type === 'way'
          ? (relationWays.get(member.ref) ?? [])
          : [],
    );
    const coordinate = representativePoint(
      refs.map((ref) => coordinates.get(ref)),
    );
    if (coordinate) points.push(normalize(relation, coordinate));
    else discarded.relation += 1;
  }

  const merged = new Map();
  for (const point of points) {
    const existing = merged.get(point.id);
    merged.set(
      point.id,
      existing
        ? {
            ...existing,
            categories: [
              ...new Set([...existing.categories, ...point.categories]),
            ],
          }
        : point,
    );
  }
  return {
    discarded,
    geometryCounts: {
      node: nodes.length,
      relation: relations.length,
      way: ways.length,
    },
    points: [...merged.values()].sort((a, b) => a.id.localeCompare(b.id)),
    sourceTimestamp,
  };
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function categoryCountsFor(points) {
  return Object.fromEntries(
    ['shop', 'repair', 'hire'].map((category) => [
      category,
      points.filter((point) => point.categories.includes(category)).length,
    ]),
  );
}

async function loadCoverageAreas(forceDownload) {
  const areas = [];
  for (const input of coverageInputs) {
    const outputPath = resolve(cacheRoot, `${input.id}.poly`);
    await downloadFile({
      forceDownload,
      label: `${input.label} coverage polygon`,
      outputPath,
      url: input.url,
    });
    areas.push(
      parseGeofabrikPoly(
        await readFile(outputPath, 'utf8'),
        input.id,
        input.label,
      ),
    );
  }
  return areas;
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
        if (content) total += gzipSync(content).byteLength;
      }
    }
    maximum = Math.max(maximum, total);
  }
  return maximum;
}

function assertGeneratedAssetBudgets(metrics) {
  const mebibyte = 1_048_576;
  const failures = [];
  if (metrics.cyclingPoiDataBytes > 15 * mebibyte) {
    failures.push('cycling-place data exceeds 15 MiB');
  }
  if (metrics.fileCount > 10_000) {
    failures.push('cycling-place file count exceeds 10,000');
  }
  if (metrics.largestAssetBytes > 20 * mebibyte) {
    failures.push('a generated cycling-place asset exceeds 20 MiB');
  }
  if (metrics.manifestBytes > mebibyte) {
    failures.push('cycling-place manifest exceeds 1 MiB');
  }
  if (metrics.pointIndexBytes > 5 * mebibyte) {
    failures.push('cycling-place point index exceeds 5 MiB');
  }
  if (metrics.maximumInitialCompressedBytes > mebibyte) {
    failures.push(
      'a 3×3 initial cycling-place payload exceeds 1 MiB compressed',
    );
  }
  if (failures.length > 0) {
    throw new Error(`Generated asset budget failed: ${failures.join('; ')}`);
  }
}

async function writeSpatialOutput({
  coverageAreas,
  duplicateRegionIds,
  inputsReport,
  points,
  refreshedAt,
  resourceUsage,
}) {
  const chunks = new Map();
  const pointIndex = {};
  for (const point of points) {
    const key = getTileKey(point);
    pointIndex[point.id] = key;
    const chunk = chunks.get(key) ?? [];
    chunk.push(point);
    chunks.set(key, chunk);
  }

  await rm(temporaryRoot, { force: true, recursive: true });
  const chunkMetadata = {};
  const chunkContents = new Map();
  let cyclingPoiDataBytes = 0;
  let largestAssetBytes = 0;
  for (const [key, chunkPoints] of [...chunks.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    chunkPoints.sort((left, right) => left.id.localeCompare(right.id));
    const content = json({ key, points: chunkPoints, schemaVersion: 2 });
    const hash = createHash('sha256')
      .update(content)
      .digest('hex')
      .slice(0, 16);
    const path = `chunks/${key}.${hash}.json`;
    await mkdir(dirname(resolve(temporaryRoot, path)), { recursive: true });
    await writeFile(resolve(temporaryRoot, path), content);
    const contentBytes = Buffer.byteLength(content);
    cyclingPoiDataBytes += contentBytes;
    largestAssetBytes = Math.max(largestAssetBytes, contentBytes);
    chunkContents.set(key, content);
    chunkMetadata[key] = {
      bounds: getTileBounds(key),
      count: chunkPoints.length,
      path,
    };
  }

  const pointIndexContent = json(pointIndex);
  const pointIndexHash = createHash('sha256')
    .update(pointIndexContent)
    .digest('hex')
    .slice(0, 16);
  const pointIndexPath = `indexes/point-index.${pointIndexHash}.json`;
  const categoryCounts = categoryCountsFor(points);
  const sourceTimestamp =
    inputsReport
      .map((input) => input.sourceTimestamp)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  const manifest = {
    categoryCounts,
    chunkZoom: 12,
    chunks: chunkMetadata,
    coverage: { areas: coverageAreas, label: coverageLabel },
    pointIndexPath,
    recordCount: points.length,
    refreshedAt,
    schemaVersion: 2,
    sources: [
      {
        attribution: 'Data © OpenStreetMap contributors',
        id: 'osm',
        label: 'OpenStreetMap',
        licenceName: 'Open Database Licence 1.0',
        licenceUrl: osmLicenceUrl,
        recordCount: points.length,
        sourceTimestamp,
        sourceUrl: osmCatalogueUrl,
      },
    ],
  };
  const manifestContent = json(manifest);
  await mkdir(dirname(resolve(temporaryRoot, pointIndexPath)), {
    recursive: true,
  });
  await writeFile(resolve(temporaryRoot, pointIndexPath), pointIndexContent);
  await writeFile(resolve(temporaryRoot, 'manifest.json'), manifestContent);

  const manifestBytes = Buffer.byteLength(manifestContent);
  const pointIndexBytes = Buffer.byteLength(pointIndexContent);
  cyclingPoiDataBytes += manifestBytes + pointIndexBytes;
  largestAssetBytes = Math.max(
    largestAssetBytes,
    manifestBytes,
    pointIndexBytes,
  );
  const generatedAssets = {
    cyclingPoiDataBytes,
    fileCount: chunks.size + 2,
    largestAssetBytes,
    manifestBytes,
    maximumInitialCompressedBytes: maximumInitialCompressedBytes(chunkContents),
    pointIndexBytes,
  };
  assertGeneratedAssetBudgets(generatedAssets);

  await rm(outputRoot, { force: true, recursive: true });
  await rename(temporaryRoot, outputRoot);

  const report = {
    ...manifest,
    chunkCount: chunks.size,
    discarded: inputsReport.reduce(
      (counts, input) => ({
        relation: counts.relation + input.discarded.relation,
        way: counts.way + input.discarded.way,
      }),
      { relation: 0, way: 0 },
    ),
    duplicateRegionIds: {
      count: duplicateRegionIds.length,
      samples: duplicateRegionIds.slice(0, 100),
    },
    generatedAssets,
    geometryCounts: inputsReport.reduce(
      (counts, input) => ({
        node: counts.node + input.geometryCounts.node,
        relation: counts.relation + input.geometryCounts.relation,
        way: counts.way + input.geometryCounts.way,
      }),
      { node: 0, relation: 0, way: 0 },
    ),
    inputs: inputsReport,
    multiCategoryCount: points.filter((point) => point.categories.length > 1)
      .length,
    naming: {
      explicit: points.filter(
        (point) =>
          !['Bicycle shop', 'Bicycle repair station', 'Cycle hire'].includes(
            point.name,
          ),
      ).length,
      generic: points.filter((point) =>
        ['Bicycle shop', 'Bicycle repair station', 'Cycle hire'].includes(
          point.name,
        ),
      ).length,
    },
    resourceUsage,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function main() {
  const { forceDownload, inputs } = parseArguments();
  if (inputs.length === 0) {
    throw new Error('At least one OSM input is required.');
  }

  const resourceMonitor = createResourceMonitor();
  const refreshedAt = new Date().toISOString();
  const mergedPoints = new Map();
  const duplicateRegionIds = new Set();
  const inputsReport = [];

  for (const input of inputs) {
    await downloadFile({
      forceDownload,
      label: `${input.label} OSM extract`,
      outputPath: input.pbfPath,
      url: input.url,
    });
    const inputMonitor = createResourceMonitor();
    const [result, pbfChecksum] = await Promise.all([
      extractPoints(input.pbfPath),
      sha256File(input.pbfPath),
    ]);
    for (const point of result.points) {
      const existing = mergedPoints.get(point.id);
      if (existing) duplicateRegionIds.add(point.id);
      mergedPoints.set(
        point.id,
        existing
          ? {
              ...existing,
              categories: [
                ...new Set([...existing.categories, ...point.categories]),
              ],
              properties: { ...point.properties, ...existing.properties },
            }
          : point,
      );
    }
    const inputUsage = inputMonitor.finish();
    inputsReport.push({
      categoryCounts: categoryCountsFor(result.points),
      countryId: input.countryId,
      discarded: result.discarded,
      elapsedSeconds: inputUsage.elapsedSeconds,
      geometryCounts: result.geometryCounts,
      id: input.id,
      label: input.label,
      pbfSha256: pbfChecksum,
      peakRssBytes: inputUsage.peakRssBytes,
      recordCount: result.points.length,
      sourceTimestamp: result.sourceTimestamp,
      sourceUrl: input.url,
    });
    console.log(
      `Processed ${result.points.length.toLocaleString()} ${input.label} cycling places in ${inputUsage.elapsedSeconds.toLocaleString()}s.`,
    );
  }

  const points = [...mergedPoints.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const coverageAreas = await loadCoverageAreas(forceDownload);
  const resourceUsage = resourceMonitor.finish();
  const report = await writeSpatialOutput({
    coverageAreas,
    duplicateRegionIds: [...duplicateRegionIds].sort(),
    inputsReport,
    points,
    refreshedAt,
    resourceUsage,
  });

  console.log(
    `Generated ${report.recordCount.toLocaleString()} ${coverageLabel} cycling places in ${report.chunkCount.toLocaleString()} chunks: ${JSON.stringify(report.categoryCounts)}.`,
  );
  console.log(
    `Cycling-place assets use ${(report.generatedAssets.cyclingPoiDataBytes / 1_048_576).toFixed(1)} MiB across ${report.generatedAssets.fileCount.toLocaleString()} files; peak RSS ${(report.resourceUsage.peakRssBytes / 1_073_741_824).toFixed(2)} GiB.`,
  );
}

await main();
