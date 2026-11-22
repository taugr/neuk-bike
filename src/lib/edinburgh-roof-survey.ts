import { MercatorCoordinate, type LngLatBounds } from 'maplibre-gl';
import survey from '@/data/edinburgh-lidar.json';
import { decodeRoofSamples, type RoofSurvey } from './waverley-roof-profile';

const root = '/data/edinburgh-lidar';
const scale = 2 ** survey.zoom;
const size = survey.samples;
const gridSize = scale * size;
const roofTiles = new Set(survey.roofTiles);
const demTiles = new Set(survey.demTiles);
type SampleTile = ReturnType<typeof decodeRoofSamples>;

export function edinburghTerrainTile(z: number, x: number, y: number) {
  const key = `${z}/${x}/${y}`;
  return demTiles.has(key) ? `${root}/dem/${key}.png` : undefined;
}

export function edinburghRoofTilesInView(bounds: LngLatBounds) {
  const nw = MercatorCoordinate.fromLngLat(bounds.getNorthWest());
  const se = MercatorCoordinate.fromLngLat(bounds.getSouthEast());
  // Include enough across the viewport edge to fit a building that straddles it.
  const margin = 0.28;
  const left = Math.floor(nw.x * scale - margin);
  const right = Math.floor(se.x * scale + margin);
  const top = Math.floor(nw.y * scale - margin);
  const bottom = Math.floor(se.y * scale + margin);
  const visible: string[] = [];
  for (let x = left; x <= right; x++) {
    for (let y = top; y <= bottom; y++) {
      const key = `${x}/${y}`;
      if (roofTiles.has(key)) visible.push(key);
    }
  }
  return visible;
}

export function sampleEdinburghRoofTiles(
  tiles: ReadonlyMap<string, SampleTile>,
): RoofSurvey {
  const sample: RoofSurvey = ({ x, y }) => {
    const column = Math.floor(x * gridSize);
    const row = Math.floor(y * gridSize);
    const key = `${Math.floor(column / size)}/${Math.floor(row / size)}`;
    return tiles.get(key)?.(column % size, row % size);
  };
  sample.grid = {
    northwest: { x: 0, y: 0 },
    width: gridSize,
    height: gridSize,
    columnStep: 1 / gridSize,
    rowStep: 1 / gridSize,
  };
  const bounds = [...tiles.keys()].map((key) => key.split('/').map(Number));
  sample.intersects = (outline) => {
    const xs = outline.map(({ x }) => x * scale);
    const ys = outline.map(({ y }) => y * scale);
    const [left, right] = [Math.min(...xs), Math.max(...xs)];
    const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
    return bounds.some(
      ([x, y]) => x < right && x + 1 > left && y < bottom && y + 1 > top,
    );
  };
  return sample;
}

export async function loadEdinburghRoofTile(key: string, signal: AbortSignal) {
  const path = `${root}/roofs/${key}.bin`;
  const response = await fetch(path, { signal }).catch((error: unknown) => {
    if (signal.aborted || !(error instanceof TypeError)) throw error;
    return fetch(path, { signal });
  });
  if (!response.ok)
    throw new Error(`Edinburgh roof tile ${key}: ${response.status}`);
  return decodeRoofSamples(await response.arrayBuffer(), size, size);
}
