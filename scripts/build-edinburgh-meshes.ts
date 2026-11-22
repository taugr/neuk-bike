import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { MercatorCoordinate, type GeoJSONFeature } from 'maplibre-gl';
import {
  buildAerialBuildings,
  materialRoofStride,
} from '../src/lib/map-aerial-roof-geometry';
import {
  edinburghMeshVersion,
  edinburghMeshZoom,
  encodeEdinburghMesh,
} from '../src/lib/edinburgh-mesh';
import type { RoofSurvey } from '../src/lib/waverley-roof-profile';
import {
  edinburghCityOverviewZoom,
  edinburghOverviewChild,
  edinburghOverviewChildCount,
  edinburghOverviewHeaderBytes,
  edinburghOverviewZoom,
} from '../src/lib/edinburgh-overview-mesh';
import { wallVertexStride } from '../src/lib/map-aerial-walls';
import {
  buildEdinburghCastle,
  isCastleGatehouse,
} from './edinburgh-castle-geometry';

type Footprint = Pick<GeoJSONFeature, 'geometry' | 'properties'>;
type Point = { x: number; y: number };

const [stageArg, outputArg, mode] = process.argv.slice(2);
if (!stageArg || !outputArg)
  throw new Error(
    'Usage: node build-edinburgh-meshes.mjs <prepared-area> <empty-output> [--overview-only|--city-overview-only]',
  );
const stage = resolve(stageArg);
const output = resolve(outputArg);
const assetDirectory = resolve(output, 'meshes');
mkdirSync(assetDirectory, { recursive: true });
const survey = JSON.parse(
  readFileSync(resolve(stage, 'survey.json'), 'utf8'),
) as {
  zoom: number;
  samples: number;
};
if (survey.zoom !== edinburghMeshZoom)
  throw new Error('Unexpected Edinburgh survey zoom');
const size = survey.samples;
const count = 2 ** survey.zoom;
const gridSize = count * size;
const chunkNames = Object.keys(
  JSON.parse(readFileSync(resolve(stage, 'footprints.json'), 'utf8')),
).sort();
const surveyTiles = new Map<string, Int16Array>();
for (const file of readdirSync(resolve(stage, 'surveys'))) {
  if (!file.endsWith('.bin')) continue;
  const bytes = Uint8Array.from(readFileSync(resolve(stage, 'surveys', file)));
  if (bytes.byteLength !== size * size * 4)
    throw new Error(`Invalid survey tile ${file}`);
  surveyTiles.set(file.slice(0, -4), new Int16Array(bytes.buffer));
}
const fallbackTerrain = new Map<string, Int16Array>();
for (const file of readdirSync(resolve(stage, 'mapzen'))) {
  if (!file.endsWith('.bin')) continue;
  const bytes = Uint8Array.from(readFileSync(resolve(stage, 'mapzen', file)));
  fallbackTerrain.set(file.slice(0, -4), new Int16Array(bytes.buffer));
}

function citySample({ x, y }: Point) {
  const column = Math.floor(x * gridSize);
  const row = Math.floor(y * gridSize);
  const tile = surveyTiles.get(
    `${Math.floor(column / size)}-${Math.floor(row / size)}`,
  );
  const index = ((row % size) * size + (column % size)) * 2;
  return tile ? ([tile[index], tile[index + 1]] as const) : undefined;
}

const roofSurvey: RoofSurvey = (point) => {
  const pair = citySample(point);
  if (pair && pair[0] !== -32768 && pair[1] !== -32768)
    return { roof: pair[0] / 10, ground: pair[1] / 10 };
};
roofSurvey.grid = {
  northwest: { x: 0, y: 0 },
  width: gridSize,
  height: gridSize,
  columnStep: 1 / gridSize,
  rowStep: 1 / gridSize,
};
roofSurvey.intersects = (outline) => {
  const xs = outline.map(({ x }) => Math.floor(x * count));
  const ys = outline.map(({ y }) => Math.floor(y * count));
  for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
      if (surveyTiles.has(`${x}-${y}`)) return true;
    }
  }
  return false;
};

function terrainAt(point: Point) {
  const pair = citySample(point);
  const ground = pair?.[1];
  if (ground !== undefined && ground !== -32768) return ground / 10;
  const column = Math.floor(point.x * 2 ** 14 * 256);
  const row = Math.floor(point.y * 2 ** 14 * 256);
  const fallback = fallbackTerrain.get(`${column >> 8}-${row >> 8}`);
  return (fallback?.[(row % 256) * 256 + (column % 256)] ?? 0) / 10;
}

const castle = buildEdinburghCastle();
function buildTile(name: string, compactCity = false, cityScale = false) {
  const features = readFileSync(
    resolve(stage, 'footprints', `${name}.ndjson`),
    'utf8',
  )
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Footprint);
  const castleWalls = castle.get(name);
  const historicFeatures = castleWalls
    ? features.filter(({ geometry }) => !isCastleGatehouse(geometry))
    : features;
  const result = buildAerialBuildings(
    historicFeatures,
    (location) => terrainAt(MercatorCoordinate.fromLngLat(location)),
    {
      survey: roofSurvey,
      materials: true,
      photoGate: false,
      edinburghPilot: 'city',
      compactCity,
      cityScale,
    },
  );
  return {
    result,
    removed: features.length - historicFeatures.length,
    mesh: {
      roofs: [...result.materialRoofs.values()].flatMap(
        ({ vertices }) => vertices,
      ),
      walls: castleWalls ? result.walls.concat(castleWalls) : result.walls,
      outlines: result.outlines,
      buildings: result.generatedBuildings,
      surveyed: result.measuredBuildings,
    },
  };
}

function buildOverview(cityScale = false) {
  const zoom = cityScale ? edinburghCityOverviewZoom : edinburghOverviewZoom;
  const directoryName = cityScale ? 'city-overview' : 'overview';
  const neighbourhoodShift = edinburghMeshZoom - edinburghOverviewZoom;
  const groups = new Map<string, Map<number, string[]>>();
  for (const name of chunkNames) {
    const [x, y] = name.split('-').map(Number);
    const overview = cityScale
      ? edinburghOverviewChild(
          x >> neighbourhoodShift,
          y >> neighbourhoodShift,
          edinburghOverviewZoom,
          zoom,
        )
      : edinburghOverviewChild(x, y);
    const { parent, slot } = overview;
    const group = groups.get(parent) ?? new Map<number, string[]>();
    const names = group.get(slot) ?? [];
    names.push(name);
    group.set(slot, names);
    groups.set(parent, group);
  }
  const overviewRoot = resolve(output, directoryName);
  const tiles: Record<string, { bytes: number; triangles: number }> = {};
  for (const [parent, group] of groups) {
    const [x, y] = parent.split('/').map(Number);
    const roofs: number[][] = [];
    const walls: number[][] = [];
    const ends = new Uint32Array(edinburghOverviewChildCount * 2);
    let roofsLength = 0;
    let wallsLength = 0;
    let buildings = 0;
    let surveyed = 0;
    for (let slot = 0; slot < edinburghOverviewChildCount; slot++) {
      for (const name of group.get(slot) ?? []) {
        const { mesh } = buildTile(name, true, cityScale);
        roofs.push(mesh.roofs);
        walls.push(mesh.walls);
        roofsLength += mesh.roofs.length;
        wallsLength += mesh.walls.length;
        buildings += mesh.buildings;
        surveyed += mesh.surveyed;
      }
      ends[slot] = roofsLength / materialRoofStride;
      ends[edinburghOverviewChildCount + slot] = wallsLength / wallVertexStride;
    }
    const triangles =
      (roofsLength / materialRoofStride + wallsLength / wallVertexStride) / 3;
    if (!triangles) continue;
    const mesh = encodeEdinburghMesh(
      {
        roofs: roofs.flat(),
        walls: walls.flat(),
        outlines: [],
        buildings,
        surveyed,
      },
      x,
      y,
      zoom,
    );
    const header = Buffer.from(ends.buffer);
    if (header.byteLength !== edinburghOverviewHeaderBytes)
      throw new Error('Invalid overview mesh header');
    const compressed = gzipSync(Buffer.concat([header, Buffer.from(mesh)]), {
      level: cityScale ? 6 : 4,
    });
    const directory = resolve(overviewRoot, String(x));
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, `${y}.bin.gz`), compressed);
    tiles[parent] = { bytes: compressed.byteLength, triangles };
    if (Object.keys(tiles).length % 20 === 0)
      process.stdout.write(
        `Compiled ${Object.keys(tiles).length}/${groups.size} Edinburgh ${directoryName} tiles\n`,
      );
  }
  const entries = Object.entries(tiles).map(
    ([key, { bytes, triangles }]) =>
      `  "${key}": { "bytes": ${bytes}, "triangles": ${triangles} }`,
  );
  writeFileSync(
    resolve(overviewRoot, 'index.json'),
    `{\n${entries.join(',\n')}\n}\n`,
  );
}

if (mode === '--overview-only' || mode === '--city-overview-only') {
  buildOverview(mode === '--city-overview-only');
  process.exit(0);
}

const tiles: string[] = [];
const sizes: number[] = [];
let surveyed = 0;
let buildings = 0;
let roofTriangles = 0;
let modeledOpenings = 0;
const historicBuildings = { 'old-town': 0, 'new-town': 0 };
const historicOpenings = { 'old-town': 0, 'new-town': 0 };
let replacedGatehouseFootprints = 0;
for (const name of chunkNames) {
  const [x, y] = name.split('-').map(Number);
  const { mesh, result, removed } = buildTile(name);
  replacedGatehouseFootprints += removed;
  if (!mesh.roofs.length && !mesh.walls.length) continue;
  const bytes = encodeEdinburghMesh(mesh, x, y);
  const compressed = gzipSync(Buffer.from(bytes), { level: 4 });
  const directory = resolve(assetDirectory, String(x));
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${y}.bin.gz`), compressed);
  tiles.push(`${x}/${y}`);
  sizes.push(compressed.byteLength);
  surveyed += result.measuredBuildings;
  buildings += result.generatedBuildings;
  roofTriangles += mesh.roofs.length / (materialRoofStride * 3);
  modeledOpenings += result.modeledOpenings;
  for (const district of ['old-town', 'new-town'] as const) {
    historicBuildings[district] += result.historicBuildings[district];
    historicOpenings[district] += result.historicOpenings[district];
  }
  if (tiles.length % 150 === 0)
    process.stdout.write(
      `Compiled ${tiles.length}/${chunkNames.length} Edinburgh mesh tiles\n`,
    );
}
if (!replacedGatehouseFootprints)
  throw new Error('Missing the mapped Edinburgh Castle Gatehouse footprint');
const demTiles = readdirSync(resolve(stage, 'dem'), {
  recursive: true,
  encoding: 'utf8',
})
  .filter((file) => file.endsWith('.png'))
  .map((file) => file.slice(0, -4))
  .sort();
cpSync(resolve(stage, 'dem'), resolve(output, 'dem'), { recursive: true });
const sorted = sizes.slice().sort((a, b) => a - b);
const metrics = {
  buildings,
  surveyed,
  roofTriangles,
  modeledOpenings,
  historicBuildings,
  historicOpenings,
  castleTiles: castle.size,
  replacedGatehouseFootprints,
  medianTileBytes: sorted[Math.floor(sorted.length / 2)],
  p95TileBytes: sorted[Math.floor(sorted.length * 0.95)],
  maxTileBytes: sorted.at(-1),
  totalMeshBytes: sizes.reduce((a, b) => a + b, 0),
};
writeFileSync(
  resolve(output, 'index.json'),
  JSON.stringify({
    version: edinburghMeshVersion,
    zoom: edinburghMeshZoom,
    tiles,
    demTiles,
    boundary: JSON.parse(readFileSync(resolve(stage, 'boundary.json'), 'utf8')),
    metrics,
  }),
);
process.stdout.write(`${JSON.stringify(metrics)}\n`);
buildOverview();
buildOverview(true);
