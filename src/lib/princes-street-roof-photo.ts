import { LngLatBounds, MercatorCoordinate } from 'maplibre-gl';
import photo from '@/data/princes-street-roof-photo.json';

const [west, south, east, north] = photo.bounds;
export const princesStreetRoofPhotoBounds = new LngLatBounds(
  [west, south],
  [east, north],
);
export const princesStreetRoofPhotos = {
  photo: {
    path: photo.texture,
    credit:
      '<a href="https://commons.wikimedia.org/wiki/File:Edinburgh_Waverley_railway_station_-_aerial_-_2025-04-19_02.jpg">Princes Street roof photo</a> by 瑞丽江的河水 (rectified and masked, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>)',
  },
  detail: {
    path: photo.detailTexture,
    credit:
      'Princes Street roof footage by Nick Hawkes (<a href="https://www.pexels.com/video/edinburgh-scotland-19951743/">east view</a> and <a href="https://www.pexels.com/video/edinburgh-scotland-19951740/">north view</a>, rectified and masked, <a href="https://www.pexels.com/license/">Pexels License</a>)',
  },
};
export type PrincesStreetRoofPhotoMode = keyof typeof princesStreetRoofPhotos;

const northwest = MercatorCoordinate.fromLngLat([west, north]);
const southeast = MercatorCoordinate.fromLngLat([east, south]);

export function princesStreetRoofPhotoRect(origin: {
  x: number;
  y: number;
  z: number;
}) {
  const scale = 2 ** origin.z;
  return [
    northwest.x * scale - origin.x,
    northwest.y * scale - origin.y,
    1 / ((southeast.x - northwest.x) * scale),
    1 / ((southeast.y - northwest.y) * scale),
  ] as const;
}

const { flatRoof } = photo;
const front = MercatorCoordinate.fromLngLat([
  flatRoof.west[0],
  flatRoof.west[1],
]);
const end = MercatorCoordinate.fromLngLat([flatRoof.east[0], flatRoof.east[1]]);
const length = Math.hypot(end.x - front.x, end.y - front.y);
const ux = (end.x - front.x) / length;
const uy = (end.y - front.y) / length;
const metresPerUnit = 1 / front.meterInMercatorCoordinateUnits();
const [left, bottom, right, top] = flatRoof.plateau;
const centerAlong = (left + right) / (2 * metresPerUnit);
const centerInward = (bottom + top) / (2 * metresPerUnit);
export const princesStreetFlatRoofCenter = {
  x: front.x + ux * centerAlong + uy * centerInward,
  y: front.y + uy * centerAlong - ux * centerInward,
};

export function princesStreetRoofMetres(point: { x: number; y: number }) {
  const dx = (point.x - front.x) * metresPerUnit;
  const dy = (point.y - front.y) * metresPerUnit;
  return [dx * ux + dy * uy, dx * uy - dy * ux] as const;
}

// Broad finish limits. Keep the photo-referenced materials on the south block.
export const princesStreetModeledRoofBounds = [-49, -1, 45, 33] as const;
export const princesStreetRoofDeck = flatRoof.plateau;
export const princesStreetRoofCourts = flatRoof.courts;

function insideDistance(
  x: number,
  y: number,
  [west, south, east, north]: readonly number[],
) {
  return Math.min(x - west, east - x, y - south, north - y);
}

/** The detail frame resolves glazing where the survey sees into two lightwells. */
export function princesStreetRoofPlane(
  point: { x: number; y: number },
  measured: number,
  showSkylights = false,
) {
  const [x, y] = princesStreetRoofMetres(point);
  const edge = insideDistance(x, y, flatRoof.plateau);
  if (edge <= 0) return measured;
  const lightwell = Math.max(
    ...flatRoof.courts.map((court) => insideDistance(x, y, court)),
  );
  const distance = showSkylights ? edge : Math.min(edge, -lightwell);
  const skylight = showSkylights
    ? 0.65 * Math.max(0, Math.min(1, lightwell / 0.8))
    : 0;
  const weight = Math.max(0, Math.min(1, distance / 1.35));
  return measured + (flatRoof.elevation + skylight - measured) * weight;
}
