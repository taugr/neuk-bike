import { MercatorCoordinate } from 'maplibre-gl';
import frontage from '@/data/princes-street-facades.json';

type Point = { x: number; y: number };

export const princesStreetFacadePath = frontage.texture;
export const princesStreetFacadeZoom = 18;
export const princesStreetFacadeReferences =
  '<a href="/textures/princes-street-facades.license.txt">Princes Street façade references</a>';
export const princesStreetFacadeCredit = [
  'Princes Street textures (cropped, rectified and masked, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>)',
  '<a href="/textures/princes-street-facades.license.txt">photo credits and source licences</a>',
].join(' · ');

const start = MercatorCoordinate.fromLngLat([
  frontage.west[0],
  frontage.west[1],
]);
const end = MercatorCoordinate.fromLngLat([frontage.east[0], frontage.east[1]]);
const dx = end.x - start.x;
const dy = end.y - start.y;
const length = Math.hypot(dx, dy);
const tolerance = 1.6 * start.meterInMercatorCoordinateUnits();

export function princesStreetHorizontalCoordinates(
  a: Point,
  b: Point,
  outward: Point,
) {
  // Select walls along the photographed row that face Princes Street.
  if ((-dy * outward.x + dx * outward.y) / length < 0.9) return;
  const from = { x: a.x - start.x, y: a.y - start.y };
  const to = { x: b.x - start.x, y: b.y - start.y };
  const fromDistance = Math.abs(from.x * dy - from.y * dx) / length;
  const toDistance = Math.abs(to.x * dy - to.y * dx) / length;
  if (Math.max(fromDistance, toDistance) > tolerance) return;
  const u0 = (from.x * dx + from.y * dy) / length ** 2;
  const u1 = (to.x * dx + to.y * dy) / length ** 2;
  if (Math.min(u0, u1) < -0.01 || Math.max(u0, u1) > 1.01) return;
  return [u0, u1] as const;
}

export function princesStreetVerticalCoordinate(elevation: number) {
  return (frontage.top - elevation) / (frontage.top - frontage.bottom);
}

export function princesStreetElevation(vertical: number) {
  return frontage.top - vertical * (frontage.top - frontage.bottom);
}
