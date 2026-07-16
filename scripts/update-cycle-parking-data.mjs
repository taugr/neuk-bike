import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createOSMStream } from 'osm-pbf-parser-node';
import {
  deriveParkingNames,
  distanceMeters,
  getTileBounds,
  getTileKey,
  isGenericParkingName,
  mergeParkingSources,
  normalizeOsmProperties,
  PARKING_CHUNK_ZOOM,
  PARKING_SCHEMA_VERSION,
  representativePoint,
} from './parking-data-utils.mjs';

const councilSourceUrl =
  'https://services-eu1.arcgis.com/FgpikkYuSUOuITxp/arcgis/rest/services/Public_Bike_Parking/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson';
const councilLicenceUrl =
  'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';
const councilAttribution =
  'Copyright City of Edinburgh Council, contains Ordnance Survey data (c) Crown copyright and database right 2026.';
const osmSourceUrl =
  'https://download.geofabrik.de/europe/united-kingdom/scotland-latest.osm.pbf';
const osmLicenceUrl = 'https://opendatacommons.org/licenses/odbl/1-0/';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const councilOutputPath = resolve(repoRoot, 'src/data/cycle-parking.json');
const reportOutputPath = resolve(
  repoRoot,
  'src/data/cycle-parking-report.json',
);
const parkingOutputRoot = resolve(repoRoot, 'public/data/parking');
const defaultPbfPath = resolve(repoRoot, '.cache/scotland-latest.osm.pbf');
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
  return {
    forceDownload: args.includes('--force-download'),
    pbfPath:
      pbfIndex >= 0 && args[pbfIndex + 1]
        ? resolve(process.cwd(), args[pbfIndex + 1])
        : defaultPbfPath,
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

async function downloadPbf(pbfPath, forceDownload) {
  if (!forceDownload) {
    try {
      const details = await stat(pbfPath);
      if (details.size > 0) {
        console.log(`Using cached Scotland OSM extract at ${pbfPath}`);
        return;
      }
    } catch {
      // Download below.
    }
  }

  await mkdir(dirname(pbfPath), { recursive: true });
  const temporaryPath = `${pbfPath}.download`;
  const response = await fetch(osmSourceUrl);
  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to download Scotland OSM extract: ${response.status} ${response.statusText}`,
    );
  }

  console.log(`Downloading Scotland OSM extract from ${osmSourceUrl}`);
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(temporaryPath),
  );
  await rename(temporaryPath, pbfPath);
}

async function sha256File(path) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

function isParkingElement(item) {
  return item?.tags?.amenity === 'bicycle_parking';
}

async function extractOsmParking(pbfPath) {
  const parkingNodes = [];
  const parkingWays = [];
  const parkingRelations = [];
  const requiredNodeIds = new Set();
  const relationWayIds = new Set();
  let sourceTimestamp = null;

  console.log('Scanning OSM extract for bicycle parking features...');
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
    console.log('Resolving relation member ways...');
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
      `Resolving ${requiredNodeIds.size.toLocaleString()} geometry nodes...`,
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

async function extractOsmNamingContext(pbfPath, parkingPoints) {
  const parkingIndex = createParkingContextIndex(parkingPoints);
  const nearbyNodeCoordinates = new Map();
  const roadNamesByNodeId = new Map();
  const roads = [];
  const landmarks = [];
  const places = [];

  console.log('Extracting nearby streets, junctions, landmarks, and places...');
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

async function writeSpatialOutput({
  councilPoints,
  merged,
  naming,
  namingContext,
  osm,
  pbfChecksum,
  refreshedAt,
}) {
  const dataVersion = refreshedAt.replaceAll(/[-:.]/g, '').replace('Z', 'Z');
  const versionOutputRoot = resolve(parkingOutputRoot, dataVersion);
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
  await mkdir(versionOutputRoot, { recursive: true });
  const chunkManifest = {};

  for (const [key, points] of [...chunks.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const path = `${dataVersion}/${key}.json`;
    const outputPath = resolve(parkingOutputRoot, path);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify({ key, points, schemaVersion: PARKING_SCHEMA_VERSION })}\n`,
    );
    chunkManifest[key] = {
      bounds: getTileBounds(key),
      count: points.length,
      path,
    };
  }

  const sources = [
    {
      attribution: councilAttribution,
      id: 'cec',
      label: 'City of Edinburgh Council',
      licenceName: 'Open Government Licence v3.0',
      licenceUrl: councilLicenceUrl,
      recordCount: councilPoints.length,
      sourceUrl: councilSourceUrl,
    },
    {
      attribution: 'Data © OpenStreetMap contributors',
      id: 'osm',
      label: 'OpenStreetMap',
      licenceName: 'Open Database Licence 1.0',
      licenceUrl: osmLicenceUrl,
      recordCount: osm.points.length,
      sourceTimestamp: osm.sourceTimestamp,
      sourceUrl: osmSourceUrl,
    },
  ];
  const manifest = {
    chunkZoom: PARKING_CHUNK_ZOOM,
    chunks: chunkManifest,
    coverage: {
      bounds: { east: -0.5, north: 60.9, south: 54.55, west: -8.7 },
      label: 'Scotland',
    },
    recordCount: merged.points.length,
    refreshedAt,
    pointIndexPath: `${dataVersion}/point-index.json`,
    schemaVersion: PARKING_SCHEMA_VERSION,
    sources,
  };

  await writeFile(
    resolve(parkingOutputRoot, 'manifest.json'),
    `${JSON.stringify(manifest)}\n`,
  );
  await writeFile(
    resolve(versionOutputRoot, 'point-index.json'),
    `${JSON.stringify(pointIndex)}\n`,
  );

  const report = {
    chunkCount: chunks.size,
    chunkZoom: PARKING_CHUNK_ZOOM,
    councilRecordCount: councilPoints.length,
    duplicateMatches: merged.matches,
    mergedRecordCount: merged.points.length,
    naming: {
      contextCounts: {
        junctions: namingContext.junctions.length,
        landmarks: namingContext.landmarks.length,
        nearbyNodes: namingContext.nearbyNodeCount,
        places: namingContext.places.length,
        roadSamples: namingContext.roads.length,
      },
      counts: naming.counts,
      genericPercent: Number(
        ((naming.counts.generic / merged.points.length) * 100).toFixed(1),
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
      completeness: summarizeCompleteness(osm.points),
      discarded: osm.discarded,
      geometryCounts: osm.geometryCounts,
      pbfSha256: pbfChecksum,
      recordCount: osm.points.length,
      sourceTimestamp: osm.sourceTimestamp,
    },
    refreshedAt,
    schemaVersion: PARKING_SCHEMA_VERSION,
  };
  await writeFile(reportOutputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function main() {
  const { forceDownload, pbfPath } = parseArguments();
  const refreshedAt = new Date().toISOString();
  const councilPoints = await fetchCouncilDataset(refreshedAt);
  await downloadPbf(pbfPath, forceDownload);
  const [osm, pbfChecksum] = await Promise.all([
    extractOsmParking(pbfPath),
    sha256File(pbfPath),
  ]);
  const mergedSources = mergeParkingSources(councilPoints, osm.points);
  const namingContext = await extractOsmNamingContext(
    pbfPath,
    mergedSources.points,
  );
  const naming = deriveParkingNames(mergedSources.points, namingContext);
  const merged = { ...mergedSources, points: naming.points };
  const report = await writeSpatialOutput({
    councilPoints,
    merged,
    naming,
    namingContext,
    osm,
    pbfChecksum,
    refreshedAt,
  });

  console.log(
    `Generated ${report.mergedRecordCount.toLocaleString()} Scotland parking records in ${report.chunkCount} chunks.`,
  );
  console.log(
    `Matched ${report.duplicateMatches.length.toLocaleString()} Edinburgh/OSM duplicates.`,
  );
}

await main();
