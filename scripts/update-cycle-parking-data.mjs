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
  deduplicateParkingPoints,
  deriveParkingNames,
  distanceMeters,
  getTileBounds,
  getTileKey,
  isGenericParkingName,
  mergeParkingSources,
  normalizeOsmProperties,
  parseGeofabrikPoly,
  PARKING_CHUNK_ZOOM,
  PARKING_SCHEMA_VERSION,
  representativePoint,
} from './parking-data-utils.mjs';
import {
  coverageLabel,
  coverageInputs,
  osmCatalogueUrl,
  osmInputs,
  osmLicenceUrl,
} from './parking-data-sources.mjs';

const councilSourceUrl =
  'https://services-eu1.arcgis.com/FgpikkYuSUOuITxp/arcgis/rest/services/Public_Bike_Parking/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson';
const councilLicenceUrl =
  'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';
const councilAttribution =
  'Copyright City of Edinburgh Council, contains Ordnance Survey data (c) Crown copyright and database right 2026.';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const councilOutputPath = resolve(repoRoot, 'src/data/cycle-parking.json');
const reportOutputPath = resolve(
  repoRoot,
  'src/data/cycle-parking-report.json',
);
const parkingOutputRoot = resolve(repoRoot, 'public/data/parking');
const cacheRoot = resolve(repoRoot, '.cache');
const selectedOsmTagKeys = [
  'access',
  'amenity',
  'bicycle_parking',
  'capacity',
  'covered',
  'fee',
  'name',
  'operator',
];
const namingOsmTagKeys = [
  'amenity',
  'highway',
  'leisure',
  'name',
  'place',
  'public_transport',
  'railway',
  'ref',
  'shop',
  'tourism',
];
const contextRadiusMeters = 250;
const contextCellSizeDegrees = 0.01;
const excludedLandmarkAmenities = new Set([
  'bench',
  'bicycle_parking',
  'parking',
  'parking_entrance',
  'recycling',
  'toilets',
  'waste_basket',
]);

function parseArguments() {
  const args = process.argv.slice(2);
  const pbfIndex = args.indexOf('--osm-pbf');
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
  const selectedInputs = requestedRegionIds
    ? osmInputs.filter((input) => requestedRegionIds.has(input.id))
    : osmInputs;

  if (requestedRegionIds && selectedInputs.length !== requestedRegionIds.size) {
    const knownIds = new Set(selectedInputs.map((input) => input.id));
    const unknownIds = [...requestedRegionIds].filter(
      (id) => !knownIds.has(id),
    );
    throw new Error(`Unknown OSM region IDs: ${unknownIds.join(', ')}`);
  }

  return {
    forceDownload: args.includes('--force-download'),
    inputs: selectedInputs.map((input) => ({
      ...input,
      pbfPath:
        input.id === 'scotland' && pbfIndex >= 0 && args[pbfIndex + 1]
          ? resolve(process.cwd(), args[pbfIndex + 1])
          : resolve(cacheRoot, `${input.id}-latest.osm.pbf`),
    })),
    scotlandPbfOverride:
      pbfIndex >= 0 && args[pbfIndex + 1]
        ? resolve(process.cwd(), args[pbfIndex + 1])
        : null,
  };
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanProperty(value) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  return String(value);
}

function pickCouncilName(properties, index) {
  const candidates = [
    properties.LOCATION,
    properties.Location,
    properties.location,
    properties.NAME,
    properties.Name,
    properties.name,
    properties.DESCRIPTION,
    properties.Description,
  ];
  const name = candidates.find(
    (candidate) => typeof candidate === 'string' && candidate.trim().length > 0,
  );
  return name?.trim() ?? `Cycle parking ${index + 1}`;
}

function normalizeCouncilFeature(feature, index) {
  if (
    !isRecord(feature) ||
    !isRecord(feature.geometry) ||
    !Array.isArray(feature.geometry.coordinates)
  ) {
    return null;
  }

  const [longitude, latitude] = feature.geometry.coordinates;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }

  const rawProperties = isRecord(feature.properties) ? feature.properties : {};
  const properties = Object.fromEntries(
    Object.entries(rawProperties).map(([key, value]) => [
      key,
      cleanProperty(value),
    ]),
  );
  const rawId = properties.OBJECTID ?? properties.FID ?? feature.id ?? index;

  return {
    id: `cec:${String(rawId)}`,
    latitude,
    longitude,
    name: pickCouncilName(properties, index),
    properties,
    sourceId: 'cec',
  };
}

async function fetchCouncilDataset(refreshedAt) {
  const response = await fetch(councilSourceUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch council cycle parking data: ${response.status} ${response.statusText}`,
    );
  }

  const geojson = await response.json();
  if (!isRecord(geojson) || !Array.isArray(geojson.features)) {
    throw new Error(
      'Council response did not include a GeoJSON features array.',
    );
  }

  const points = geojson.features
    .map(normalizeCouncilFeature)
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id));

  const dataset = {
    metadata: {
      attribution: councilAttribution,
      licenceUrl: councilLicenceUrl,
      recordCount: points.length,
      refreshedAt,
      sourceUrl: councilSourceUrl,
    },
    points,
  };
  await mkdir(dirname(councilOutputPath), { recursive: true });
  await writeFile(councilOutputPath, `${JSON.stringify(dataset, null, 2)}\n`);
  return points;
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
      if (attempt === maximumAttempts) {
        throw new Error(
          `Failed to download ${label} after ${maximumAttempts} attempts.`,
          { cause: error },
        );
      }
      const retryDelaySeconds = attempt * 15;
      console.warn(
        `${label} download failed; retrying in ${retryDelaySeconds}s.`,
      );
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, retryDelaySeconds * 1_000),
      );
    }
  }
}

async function sha256File(path) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

function sha256Content(content) {
  return createHash('sha256').update(content).digest('hex');
}

function createResourceMonitor() {
  const startedAt = performance.now();
  let peakRssBytes = process.memoryUsage().rss;
  const timer = setInterval(() => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  }, 250);
  timer.unref();

  return {
    finish() {
      clearInterval(timer);
      peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
      return {
        elapsedSeconds: Number(
          ((performance.now() - startedAt) / 1_000).toFixed(1),
        ),
        peakRssBytes,
      };
    },
    snapshot() {
      peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
      return {
        elapsedSeconds: Number(
          ((performance.now() - startedAt) / 1_000).toFixed(1),
        ),
        peakRssBytes,
      };
    },
  };
}

function isParkingElement(item) {
  return item?.tags?.amenity === 'bicycle_parking';
}

async function extractOsmParking(pbfPath, label) {
  const parkingNodes = [];
  const parkingWays = [];
  const parkingRelations = [];
  const requiredNodeIds = new Set();
  const relationWayIds = new Set();
  let sourceTimestamp = null;

  console.log(`Scanning ${label} for bicycle parking features...`);
  for await (const item of createOSMStream(pbfPath, {
    withInfo: false,
    withTags: {
      node: selectedOsmTagKeys,
      relation: selectedOsmTagKeys,
      way: selectedOsmTagKeys,
    },
  })) {
    if (!item.type) {
      if (item.osmosis_replication_timestamp) {
        sourceTimestamp = new Date(
          item.osmosis_replication_timestamp * 1_000,
        ).toISOString();
      }
      continue;
    }
    if (!isParkingElement(item)) {
      continue;
    }
    if (item.type === 'node') {
      parkingNodes.push(item);
    } else if (item.type === 'way') {
      parkingWays.push(item);
      for (const ref of item.refs ?? []) {
        requiredNodeIds.add(ref);
      }
    } else if (item.type === 'relation') {
      parkingRelations.push(item);
      for (const member of item.members ?? []) {
        if (member.type === 'node') {
          requiredNodeIds.add(member.ref);
        } else if (member.type === 'way') {
          relationWayIds.add(member.ref);
        }
      }
    }
  }

  const relationWays = new Map();
  if (relationWayIds.size > 0) {
    console.log(`Resolving ${label} relation member ways...`);
    for await (const item of createOSMStream(pbfPath, {
      withInfo: false,
      withTags: false,
    })) {
      if (item.type === 'way' && relationWayIds.has(item.id)) {
        relationWays.set(item.id, item.refs ?? []);
        for (const ref of item.refs ?? []) {
          requiredNodeIds.add(ref);
        }
      }
    }
  }

  const nodeCoordinates = new Map(
    parkingNodes.map((node) => [
      node.id,
      { latitude: node.lat, longitude: node.lon },
    ]),
  );
  if (requiredNodeIds.size > 0) {
    console.log(
      `Resolving ${requiredNodeIds.size.toLocaleString()} ${label} geometry nodes...`,
    );
    for await (const item of createOSMStream(pbfPath, {
      withInfo: false,
      withTags: false,
    })) {
      if (item.type === 'node' && requiredNodeIds.has(item.id)) {
        nodeCoordinates.set(item.id, {
          latitude: item.lat,
          longitude: item.lon,
        });
      }
    }
  }

  const discarded = { relation: 0, way: 0 };
  const normalizeElement = (element, coordinate) => ({
    id: `osm:${element.type}:${element.id}`,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    name:
      typeof element.tags?.name === 'string' && element.tags.name.trim()
        ? element.tags.name.trim()
        : 'Cycle parking',
    properties: normalizeOsmProperties(element.tags ?? {}),
    sourceId: 'osm',
  });

  const points = parkingNodes.map((node) =>
    normalizeElement(node, { latitude: node.lat, longitude: node.lon }),
  );

  for (const way of parkingWays) {
    const coordinate = representativePoint(
      (way.refs ?? []).map((ref) => nodeCoordinates.get(ref)),
    );
    if (!coordinate) {
      discarded.way += 1;
      continue;
    }
    points.push(normalizeElement(way, coordinate));
  }

  for (const relation of parkingRelations) {
    const relationNodeIds = [];
    for (const member of relation.members ?? []) {
      if (member.type === 'node') {
        relationNodeIds.push(member.ref);
      } else if (member.type === 'way') {
        relationNodeIds.push(...(relationWays.get(member.ref) ?? []));
      }
    }
    const coordinate = representativePoint(
      relationNodeIds.map((ref) => nodeCoordinates.get(ref)),
    );
    if (!coordinate) {
      discarded.relation += 1;
      continue;
    }
    points.push(normalizeElement(relation, coordinate));
  }

  return {
    discarded,
    geometryCounts: {
      node: parkingNodes.length,
      relation: parkingRelations.length,
      way: parkingWays.length,
    },
    points: points.sort((left, right) => left.id.localeCompare(right.id)),
    sourceTimestamp,
  };
}

function contextCellKey(latitude, longitude) {
  return `${Math.floor(latitude / contextCellSizeDegrees)}:${Math.floor(longitude / contextCellSizeDegrees)}`;
}

function createParkingContextIndex(points) {
  const cells = new Map();
  for (const point of points) {
    const key = contextCellKey(point.latitude, point.longitude);
    const cell = cells.get(key) ?? [];
    cell.push(point);
    cells.set(key, cell);
  }
  return cells;
}

function isNearParking(index, coordinate) {
  const latitudeCell = Math.floor(coordinate.latitude / contextCellSizeDegrees);
  const longitudeCell = Math.floor(
    coordinate.longitude / contextCellSizeDegrees,
  );

  for (let latitudeOffset = -1; latitudeOffset <= 1; latitudeOffset += 1) {
    for (let longitudeOffset = -1; longitudeOffset <= 1; longitudeOffset += 1) {
      const points =
        index.get(
          `${latitudeCell + latitudeOffset}:${longitudeCell + longitudeOffset}`,
        ) ?? [];
      if (
        points.some(
          (point) => distanceMeters(point, coordinate) <= contextRadiusMeters,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function cleanContextName(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const name = value.trim().replaceAll(/\s+/g, ' ');
  return name.length >= 2 && name.length <= 100 && !isGenericParkingName(name)
    ? name
    : null;
}

function isUsefulLandmark(tags) {
  return Boolean(
    (tags.amenity && !excludedLandmarkAmenities.has(tags.amenity)) ||
    tags.shop ||
    tags.public_transport === 'station' ||
    tags.railway === 'station' ||
    tags.railway === 'halt' ||
    ['attraction', 'gallery', 'museum'].includes(tags.tourism) ||
    ['garden', 'park', 'sports_centre', 'stadium'].includes(tags.leisure),
  );
}

async function extractOsmNamingContext(pbfPath, parkingPoints, label) {
  const parkingIndex = createParkingContextIndex(parkingPoints);
  const nearbyNodeCoordinates = new Map();
  const roadNamesByNodeId = new Map();
  const roads = [];
  const landmarks = [];
  const places = [];

  console.log(
    `Extracting ${label} nearby streets, junctions, landmarks, and places...`,
  );
  for await (const item of createOSMStream(pbfPath, {
    withInfo: false,
    withTags: {
      node: namingOsmTagKeys,
      relation: namingOsmTagKeys,
      way: namingOsmTagKeys,
    },
  })) {
    if (!item.type) {
      continue;
    }

    const tags = item.tags ?? {};
    const name = cleanContextName(tags.name);
    if (item.type === 'node') {
      const coordinate = { latitude: item.lat, longitude: item.lon };
      const nearParking = isNearParking(parkingIndex, coordinate);
      if (nearParking) {
        nearbyNodeCoordinates.set(item.id, coordinate);
      }
      if (name && tags.place) {
        places.push({ ...coordinate, name });
      }
      if (nearParking && name && isUsefulLandmark(tags)) {
        landmarks.push({ ...coordinate, name });
      }
      continue;
    }

    if (item.type !== 'way') {
      continue;
    }
    const coordinates = (item.refs ?? [])
      .map((ref) => ({ coordinate: nearbyNodeCoordinates.get(ref), ref }))
      .filter(({ coordinate }) => coordinate);

    const roadName = cleanContextName(tags.name) ?? cleanContextName(tags.ref);
    if (roadName && tags.highway) {
      for (const { coordinate, ref } of coordinates) {
        roads.push({ ...coordinate, name: roadName });
        const names = roadNamesByNodeId.get(ref) ?? new Set();
        names.add(roadName);
        roadNamesByNodeId.set(ref, names);
      }
    }

    if (name && isUsefulLandmark(tags)) {
      const coordinate = representativePoint(
        coordinates.map(({ coordinate: value }) => value),
      );
      if (coordinate) {
        landmarks.push({ ...coordinate, name });
      }
    }
  }

  const junctions = [];
  for (const [nodeId, names] of roadNamesByNodeId) {
    if (names.size < 2) {
      continue;
    }
    const coordinate = nearbyNodeCoordinates.get(nodeId);
    if (coordinate) {
      junctions.push({
        ...coordinate,
        names: [...names].sort((left, right) => left.localeCompare(right)),
      });
    }
  }

  return {
    junctions,
    landmarks,
    nearbyNodeCount: nearbyNodeCoordinates.size,
    places,
    roads,
  };
}

function summarizeCompleteness(points) {
  const fields = ['name', 'capacity', 'covered', 'access', 'bicycle_pa'];
  return Object.fromEntries(
    fields.map((field) => {
      const count = points.filter((point) => {
        const value = field === 'name' ? point.name : point.properties[field];
        return field === 'name'
          ? !isGenericParkingName(value)
          : typeof value === 'number'
            ? value > 0
            : typeof value === 'string' &&
              value.trim().length > 0 &&
              value !== 'unknown';
      }).length;
      return [
        field,
        { count, percent: Number(((count / points.length) * 100).toFixed(1)) },
      ];
    }),
  );
}

function addCountObjects(target, addition) {
  for (const [key, value] of Object.entries(addition)) {
    target[key] = (target[key] ?? 0) + value;
  }
  return target;
}

function summarizeNamingCounts(points) {
  const counts = {
    generic: 0,
    junction: 0,
    landmark: 0,
    place: 0,
    source: 0,
    street: 0,
  };
  for (const point of points) {
    const source = point.properties.nameSource;
    if (typeof source === 'string' && Object.hasOwn(counts, source)) {
      counts[source] += 1;
    } else {
      counts.generic += 1;
    }
  }
  return counts;
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
        if (content) {
          total += gzipSync(content).byteLength;
        }
      }
    }
    maximum = Math.max(maximum, total);
  }
  return maximum;
}

function assertGeneratedAssetBudgets(metrics) {
  const mebibyte = 1_048_576;
  const failures = [];
  if (metrics.parkingDataBytes > 75 * mebibyte) {
    failures.push('parking data exceeds 75 MiB');
  }
  if (metrics.fileCount > 15_000) {
    failures.push('parking file count exceeds 15,000');
  }
  if (metrics.largestAssetBytes > 20 * mebibyte) {
    failures.push('a generated parking asset exceeds 20 MiB');
  }
  if (metrics.manifestBytes > mebibyte) {
    failures.push('manifest exceeds 1 MiB');
  }
  if (metrics.pointIndexBytes > 5 * mebibyte) {
    failures.push('point index exceeds 5 MiB');
  }
  if (metrics.maximumInitialCompressedBytes > mebibyte) {
    failures.push('a 3×3 initial parking payload exceeds 1 MiB compressed');
  }
  if (failures.length > 0) {
    throw new Error(`Generated asset budget failed: ${failures.join('; ')}`);
  }
}

async function writeSpatialOutput({
  councilPoints,
  coverageAreas,
  duplicateRegionIds,
  merged,
  osmInputsReport,
  osmPoints,
  refreshedAt,
  resourceUsage,
}) {
  const chunks = new Map();
  const pointIndex = {};

  for (const point of merged.points) {
    const key = getTileKey(point);
    const points = chunks.get(key) ?? [];
    points.push(point);
    chunks.set(key, points);
    pointIndex[point.id] = key;
  }

  await rm(parkingOutputRoot, { force: true, recursive: true });
  await mkdir(parkingOutputRoot, { recursive: true });
  const chunkManifest = {};
  const chunkContents = new Map();
  let largestAssetBytes = 0;
  let parkingDataBytes = 0;

  for (const [key, points] of [...chunks.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    points.sort((left, right) => left.id.localeCompare(right.id));
    const content = `${JSON.stringify({ key, points, schemaVersion: PARKING_SCHEMA_VERSION })}\n`;
    const contentHash = sha256Content(content).slice(0, 16);
    const path = `chunks/${key}.${contentHash}.json`;
    const outputPath = resolve(parkingOutputRoot, path);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content);
    chunkContents.set(key, content);
    const contentBytes = Buffer.byteLength(content);
    largestAssetBytes = Math.max(largestAssetBytes, contentBytes);
    parkingDataBytes += contentBytes;
    chunkManifest[key] = {
      bounds: getTileBounds(key),
      count: points.length,
      path,
    };
  }

  const sources = [];
  if (councilPoints.length > 0) {
    sources.push({
      attribution: councilAttribution,
      id: 'cec',
      label: 'City of Edinburgh Council',
      licenceName: 'Open Government Licence v3.0',
      licenceUrl: councilLicenceUrl,
      recordCount: councilPoints.length,
      sourceUrl: councilSourceUrl,
    });
  }
  sources.push({
    attribution: 'Data © OpenStreetMap contributors',
    id: 'osm',
    label: 'OpenStreetMap',
    licenceName: 'Open Database Licence 1.0',
    licenceUrl: osmLicenceUrl,
    recordCount: osmPoints.length,
    sourceTimestamp:
      osmInputsReport
        .map((input) => input.sourceTimestamp)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    sourceUrl: osmCatalogueUrl,
  });

  const pointIndexContent = `${JSON.stringify(pointIndex)}\n`;
  const pointIndexHash = sha256Content(pointIndexContent).slice(0, 16);
  const pointIndexPath = `indexes/point-index.${pointIndexHash}.json`;
  const manifest = {
    chunkZoom: PARKING_CHUNK_ZOOM,
    chunks: chunkManifest,
    coverage: {
      areas: coverageAreas,
      label: coverageLabel,
    },
    recordCount: merged.points.length,
    refreshedAt,
    pointIndexPath,
    schemaVersion: PARKING_SCHEMA_VERSION,
    sources,
  };

  const manifestContent = `${JSON.stringify(manifest)}\n`;
  await mkdir(resolve(parkingOutputRoot, 'indexes'), { recursive: true });
  await writeFile(resolve(parkingOutputRoot, 'manifest.json'), manifestContent);
  await writeFile(
    resolve(parkingOutputRoot, pointIndexPath),
    pointIndexContent,
  );

  const manifestBytes = Buffer.byteLength(manifestContent);
  const pointIndexBytes = Buffer.byteLength(pointIndexContent);
  largestAssetBytes = Math.max(
    largestAssetBytes,
    manifestBytes,
    pointIndexBytes,
  );
  parkingDataBytes += manifestBytes + pointIndexBytes;
  const generatedAssets = {
    fileCount: chunks.size + 2,
    largestAssetBytes,
    manifestBytes,
    maximumInitialCompressedBytes: maximumInitialCompressedBytes(chunkContents),
    parkingDataBytes,
    pointIndexBytes,
  };
  assertGeneratedAssetBudgets(generatedAssets);

  const namingCounts = summarizeNamingCounts(merged.points);
  const geometryCounts = addCountObjects(
    { node: 0, relation: 0, way: 0 },
    osmInputsReport.reduce(
      (counts, input) => addCountObjects(counts, input.geometryCounts),
      { node: 0, relation: 0, way: 0 },
    ),
  );
  const discarded = osmInputsReport.reduce(
    (counts, input) => addCountObjects(counts, input.discarded),
    { relation: 0, way: 0 },
  );

  const report = {
    chunkCount: chunks.size,
    chunkZoom: PARKING_CHUNK_ZOOM,
    councilRecordCount: councilPoints.length,
    duplicateMatches: merged.matches,
    duplicateRegionIds: {
      count: duplicateRegionIds.length,
      samples: duplicateRegionIds.slice(0, 100),
    },
    generatedAssets,
    mergedRecordCount: merged.points.length,
    naming: {
      counts: namingCounts,
      genericPercent: Number(
        ((namingCounts.generic / merged.points.length) * 100).toFixed(1),
      ),
      samples: merged.points
        .filter((point) => point.properties.nameSource !== 'source')
        .slice(0, 24)
        .map((point) => ({
          id: point.id,
          name: point.name,
          nameSource: point.properties.nameSource,
        })),
    },
    osm: {
      completeness: summarizeCompleteness(osmPoints),
      discarded,
      geometryCounts,
      inputs: osmInputsReport,
      recordCount: osmPoints.length,
    },
    refreshedAt,
    resourceUsage,
    schemaVersion: PARKING_SCHEMA_VERSION,
  };
  await writeFile(reportOutputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function main() {
  const { forceDownload, inputs } = parseArguments();
  if (inputs.length === 0) {
    throw new Error('At least one OSM input is required.');
  }
  const resourceMonitor = createResourceMonitor();
  const refreshedAt = new Date().toISOString();
  const includesScotland = inputs.some(
    (input) => input.countryId === 'scotland',
  );
  const rawCouncilPoints = includesScotland
    ? await fetchCouncilDataset(refreshedAt)
    : [];
  let councilPoints = rawCouncilPoints;
  const allOsmPoints = [];
  const osmInputsReport = [];

  for (const input of inputs) {
    await downloadFile({
      forceDownload,
      label: `${input.label} OSM extract`,
      outputPath: input.pbfPath,
      url: input.url,
    });
    const inputMonitor = createResourceMonitor();
    const [osm, pbfChecksum] = await Promise.all([
      extractOsmParking(input.pbfPath, input.label),
      sha256File(input.pbfPath),
    ]);
    const pointsForNaming =
      input.countryId === 'scotland'
        ? [...osm.points, ...rawCouncilPoints]
        : osm.points;
    const namingContext = await extractOsmNamingContext(
      input.pbfPath,
      pointsForNaming,
      input.label,
    );
    const naming = deriveParkingNames(pointsForNaming, namingContext);
    const namedOsmPoints = naming.points.filter(
      (point) => point.sourceId === 'osm',
    );
    allOsmPoints.push(...namedOsmPoints);
    if (input.countryId === 'scotland') {
      councilPoints = naming.points.filter((point) => point.sourceId === 'cec');
    }
    const inputUsage = inputMonitor.finish();
    osmInputsReport.push({
      completeness: summarizeCompleteness(namedOsmPoints),
      countryId: input.countryId,
      discarded: osm.discarded,
      elapsedSeconds: inputUsage.elapsedSeconds,
      geometryCounts: osm.geometryCounts,
      id: input.id,
      label: input.label,
      naming: {
        contextCounts: {
          junctions: namingContext.junctions.length,
          landmarks: namingContext.landmarks.length,
          nearbyNodes: namingContext.nearbyNodeCount,
          places: namingContext.places.length,
          roadSamples: namingContext.roads.length,
        },
        counts: naming.counts,
      },
      pbfSha256: pbfChecksum,
      peakRssBytes: inputUsage.peakRssBytes,
      recordCount: namedOsmPoints.length,
      sourceTimestamp: osm.sourceTimestamp,
      sourceUrl: input.url,
    });
    console.log(
      `Processed ${namedOsmPoints.length.toLocaleString()} ${input.label} parking records in ${inputUsage.elapsedSeconds.toLocaleString()}s.`,
    );
  }

  const deduplicatedOsm = deduplicateParkingPoints(allOsmPoints);
  const merged = mergeParkingSources(councilPoints, deduplicatedOsm.points);
  const coverageAreas = await loadCoverageAreas(forceDownload);
  const resourceUsage = resourceMonitor.snapshot();
  const report = await writeSpatialOutput({
    councilPoints,
    coverageAreas,
    duplicateRegionIds: deduplicatedOsm.duplicateIds,
    merged,
    osmInputsReport,
    osmPoints: deduplicatedOsm.points,
    refreshedAt,
    resourceUsage,
  });
  const finalUsage = resourceMonitor.finish();
  report.resourceUsage = finalUsage;
  await writeFile(reportOutputPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    `Generated ${report.mergedRecordCount.toLocaleString()} ${coverageLabel} parking records in ${report.chunkCount.toLocaleString()} chunks.`,
  );
  console.log(
    `Matched ${report.duplicateMatches.length.toLocaleString()} Edinburgh/OSM duplicates.`,
  );
  console.log(
    `Parking assets use ${(report.generatedAssets.parkingDataBytes / 1_048_576).toFixed(1)} MiB across ${report.generatedAssets.fileCount.toLocaleString()} files; peak RSS ${(finalUsage.peakRssBytes / 1_073_741_824).toFixed(2)} GiB.`,
  );
}

await main();
