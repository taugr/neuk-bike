import { LngLatBounds, MercatorCoordinate } from 'maplibre-gl';
import survey from '@/data/waverley-lidar.json';

export type RoofPoint = { x: number; y: number };
type SurveySample = { roof: number; ground: number };
type SurveyGrid = {
  northwest: RoofPoint;
  width: number;
  height: number;
  columnStep: number;
  rowStep: number;
};
export type RoofSurvey = ((point: RoofPoint) => SurveySample | undefined) & {
  grid?: SurveyGrid;
  intersects?: (outline: readonly RoofPoint[]) => boolean;
};
type RoofProfile = {
  measured: boolean;
  fine: boolean;
  elevationAt: (point: RoofPoint) => number;
};

const [west, south, east, north] = survey.bounds;
export const waverleySurveyBounds = new LngLatBounds(
  [west, south],
  [east, north],
);
const [detailWest, detailSouth, detailEast, detailNorth] =
  survey.roofDetail.bounds;
export const princesStreetSurveyBounds = new LngLatBounds(
  [detailWest, detailSouth],
  [detailEast, detailNorth],
);

function roofGrid({ bounds, width, height }: typeof survey.roofDetail) {
  const [west, south, east, north] = bounds;
  const northwest = MercatorCoordinate.fromLngLat([west, north]);
  const southeast = MercatorCoordinate.fromLngLat([east, south]);
  return {
    northwest,
    southeast,
    width,
    height,
    columnStep: (southeast.x - northwest.x) / width,
    rowStep: (southeast.y - northwest.y) / height,
  };
}

const coarseGrid = roofGrid(survey);
const fineGrid = roofGrid(survey.roofDetail);

export function isInWaverleySurvey({ lng, lat }: { lng: number; lat: number }) {
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

export async function loadRoofSurvey(
  signal: AbortSignal,
  fine = false,
): Promise<RoofSurvey> {
  const filename = fine ? 'princes-roofs.bin' : 'surface.bin';
  const response = await fetch(`/data/waverley-lidar/${filename}`, { signal });
  if (!response.ok) throw new Error(`Waverley surface: ${response.status}`);
  return decodeRoofSurvey(await response.arrayBuffer(), fine);
}

export function decodeRoofSurvey(
  buffer: ArrayBuffer,
  fine = false,
): RoofSurvey {
  const { northwest, width, height, columnStep, rowStep } = fine
    ? fineGrid
    : coarseGrid;
  const sample = decodeRoofSamples(buffer, width, height);
  return ({ x, y }) => {
    const column = Math.floor((x - northwest.x) / columnStep);
    const row = Math.floor((y - northwest.y) / rowStep);
    return sample(column, row);
  };
}

export function decodeRoofSamples(
  buffer: ArrayBuffer,
  width: number,
  height: number,
) {
  if (buffer.byteLength !== width * height * 4)
    throw new Error('Invalid LiDAR surface size');
  const grid = new DataView(buffer);
  return (column: number, row: number) => {
    if (column < 0 || column >= width || row < 0 || row >= height) return;
    const offset = (row * width + column) * 4;
    const roof = grid.getInt16(offset, true);
    const ground = grid.getInt16(offset + 2, true);
    if (roof !== -32768 && ground !== -32768)
      return { roof: roof / 10, ground: ground / 10 };
  };
}

export function roofContainsPoint(
  rings: readonly RoofPoint[][],
  { x, y }: RoofPoint,
) {
  let inside = false;
  for (const ring of rings) {
    for (const [i, a] of ring.entries()) {
      const b = ring[(i + 1) % ring.length];
      if (
        a.y > y !== b.y > y &&
        x < a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)
      )
        inside = !inside;
    }
  }
  return inside;
}

function distanceToRoofEdge(
  rings: readonly RoofPoint[][],
  x: number,
  y: number,
) {
  let nearest = Infinity;
  for (const ring of rings) {
    for (const [index, start] of ring.entries()) {
      const end = ring[(index + 1) % ring.length];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      if (dx === 0 && dy === 0) continue;
      const distanceAlong =
        ((x - start.x) * dx + (y - start.y) * dy) / (dx * dx + dy * dy);
      const t = Math.max(0, Math.min(1, distanceAlong));
      nearest = Math.min(
        nearest,
        Math.hypot(x - start.x - t * dx, y - start.y - t * dy),
      );
    }
  }
  return nearest;
}

export function fitRoofProfile(
  rings: readonly RoofPoint[][],
  surveyAt: RoofSurvey,
  fallback: number,
  fineSurvey?: RoofSurvey,
): RoofProfile {
  const outline = rings[0];
  if (surveyAt.intersects && !surveyAt.intersects(outline))
    return { elevationAt: () => fallback, measured: false, fine: false };
  const fine =
    !!fineSurvey &&
    outline.every(
      ({ x, y }) =>
        x > fineGrid.northwest.x &&
        x < fineGrid.southeast.x &&
        y > fineGrid.northwest.y &&
        y < fineGrid.southeast.y,
    );
  const { northwest, width, height, columnStep, rowStep } = fine
    ? fineGrid
    : (surveyAt.grid ?? coarseGrid);
  const sampleAt = fine ? fineSurvey : surveyAt;
  const x = outline.map((point) => point.x);
  const y = outline.map((point) => point.y);
  const x0 = Math.floor((Math.min(...x) - northwest.x) / columnStep);
  const x1 = Math.floor((Math.max(...x) - northwest.x) / columnStep);
  const y0 = Math.floor((Math.min(...y) - northwest.y) / rowStep);
  const y1 = Math.floor((Math.max(...y) - northwest.y) / rowStep);
  const cells = new Map<number, number>();
  const elevations: number[] = [];
  let footprintSamples = 0;
  const roofAt = (column: number, row: number) =>
    column >= 0 && column < width ? cells.get(row * width + column) : undefined;
  for (let row = Math.max(0, y0); row <= Math.min(height - 1, y1); row++) {
    for (let col = Math.max(0, x0); col <= Math.min(width - 1, x1); col++) {
      const point = {
        x: northwest.x + (col + 0.5) * columnStep,
        y: northwest.y + (row + 0.5) * rowStep,
      };
      if (!roofContainsPoint(rings, point)) continue;
      footprintSamples++;
      const sample = sampleAt(point);
      // DTM and DSM agreeing usually means the footprint vertex is on the
      // street, a courtyard, or a structure built since this flight.
      if (!sample || sample.roof - sample.ground < 2) continue;
      cells.set(row * width + col, sample.roof);
      elevations.push(sample.roof);
    }
  }
  elevations.sort((a, b) => a - b);
  const median = elevations[Math.floor(elevations.length / 2)];
  if (fine && elevations.length < 6)
    return fitRoofProfile(rings, surveyAt, fallback);
  if (
    median === undefined ||
    (surveyAt.grid && elevations.length < Math.max(3, footprintSamples * 0.42))
  )
    return { elevationAt: () => fallback, measured: false, fine: false };
  // Preserve varying roof levels and reject isolated returns far above the
  // roof. The percentiles also keep street returns out of façade eaves.
  const low =
    elevations[Math.floor(elevations.length * (fine ? 0.05 : 0.12))] - 0.6;
  const high =
    elevations[Math.floor(elevations.length * (fine ? 0.98 : 0.92))] + 1.2;
  const coarse = fine ? fitRoofProfile(rings, surveyAt, fallback) : undefined;
  return {
    measured: true,
    fine,
    elevationAt({ x, y }: RoofPoint) {
      const column = (x - northwest.x) / columnStep - 0.5;
      const row = (y - northwest.y) / rowStep - 0.5;
      const col0 = Math.round(column);
      const row0 = Math.round(row);
      let height = 0;
      let weight = 0;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const value = roofAt(col0 + i, row0 + j);
          if (value === undefined) continue;
          const distance = Math.hypot(col0 + i - column, row0 + j - row);
          const w = 1 / (0.2 + distance * distance);
          height += Math.max(low, Math.min(high, value)) * w;
          weight += w;
        }
      }
      const elevation = (weight ? height / weight : median) + 0.12;
      if (!coarse) return elevation;
      // Half-metre cells at an eave can include a return from the wall
      // below, especially where the footprint and survey are offset.
      // Keep the continuous eave fit and blend into the finer interior.
      const edge = distanceToRoofEdge(rings, x, y) / columnStep;
      const blend = Math.max(0, Math.min(1, (edge - 1) / 3));
      if (blend === 1) return elevation;
      const eave = coarse.elevationAt({ x, y });
      return eave + (elevation - eave) * blend * blend * (3 - 2 * blend);
    },
  };
}

// Work in one common grid so shared triangle edges split at the same points.
export function gridFractions(start: number, end: number, step: number) {
  const fractions: number[] = [];
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  for (let cell = Math.floor(lo / step) + 1; cell * step < hi; cell++) {
    fractions.push((cell * step - start) / (end - start));
  }
  return fractions;
}

function clip(
  polygon: RoofPoint[],
  axis: 'x' | 'y',
  line: number,
  keepGreater: boolean,
) {
  return polygon.flatMap((a, index) => {
    const b = polygon[(index + 1) % polygon.length];
    const keepA = keepGreater ? a[axis] >= line : a[axis] <= line;
    const keepB = keepGreater ? b[axis] >= line : b[axis] <= line;
    if (keepA === keepB) return keepA ? [a] : [];
    const t = (line - a[axis]) / (b[axis] - a[axis]);
    const intersection = {
      x: a.x + t * (b.x - a.x),
      y: a.y + t * (b.y - a.y),
      [axis]: line,
    };
    return keepA ? [a, intersection] : [intersection];
  });
}

export function subdivideRoof(triangle: RoofPoint[], step: number) {
  const pointsX = triangle.map(({ x }) => x);
  const pointsY = triangle.map(({ y }) => y);
  const firstX = Math.floor(Math.min(...pointsX) / step);
  const lastX = Math.floor(Math.max(...pointsX) / step);
  const firstY = Math.floor(Math.min(...pointsY) / step);
  const lastY = Math.floor(Math.max(...pointsY) / step);
  const triangles: RoofPoint[][] = [];
  for (let i = firstY; i <= lastY; i++) {
    const band = clip(
      clip(triangle, 'y', i * step, true),
      'y',
      (i + 1) * step,
      false,
    );
    if (band.length < 3) continue;
    for (let j = firstX; j <= lastX; j++) {
      const cell = clip(
        clip(band, 'x', j * step, true),
        'x',
        (j + 1) * step,
        false,
      );
      for (let k = 1; k + 1 < cell.length; k++)
        triangles.push([cell[0], cell[k], cell[k + 1]]);
    }
  }
  return triangles;
}
