import { MercatorCoordinate, type GeoJSONFeature } from 'maplibre-gl';
import { waverleySurveyBounds } from './waverley-roof-profile';

type Feature = Pick<GeoJSONFeature, 'geometry' | 'properties'>;
type Point = { x: number; y: number };
type Street = { start: Point; dx: number; dy: number; length: number };

export const waverleyShoppingStreets = [
  'Princes Street',
  'South St Andrew Street',
  'Leith Street',
  'St James Crescent',
  'James Craig Walk',
  'Waterloo Place',
  'Market Street',
  'East Market Street',
  'Waverley Bridge',
];
export const storefrontPoiClasses = [
  'shop',
  'grocery',
  'cafe',
  'restaurant',
  'fast_food',
  'bar',
  'ice_cream',
];
const indoorDestinations = ['mall', 'ticket', 'vacant'];

function project([lng, lat]: number[]) {
  return MercatorCoordinate.fromLngLat([lng, lat]);
}

function streetSegments(features: readonly Feature[]) {
  const roads: Street[] = [];
  for (const { geometry, properties } of features) {
    if (!waverleyShoppingStreets.includes(properties.name)) continue;
    const lines =
      geometry.type === 'LineString'
        ? [geometry.coordinates]
        : geometry.type === 'MultiLineString'
          ? geometry.coordinates
          : [];
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const start = project(line[i - 1]);
        const end = project(line[i]);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        if (length) roads.push({ start, dx, dy, length });
      }
    }
  }
  return roads;
}

export type ShopfrontMatcher = (
  start: Point,
  end: Point,
  outward: Point,
  metresPerUnit: number,
) => boolean;

export function createShopfrontMatcher(
  streets: readonly Feature[],
  businesses: readonly Feature[],
): ShopfrontMatcher {
  const roads = streetSegments(streets);
  const shops = businesses.flatMap(({ geometry, properties }) => {
    if (
      geometry.type !== 'Point' ||
      !storefrontPoiClasses.includes(properties.class) ||
      indoorDestinations.includes(properties.subclass) ||
      (properties.level != null && Number(properties.level) !== 0)
    )
      return [];
    const [lng, lat] = geometry.coordinates;
    return waverleySurveyBounds.contains([lng, lat])
      ? [project([lng, lat])]
      : [];
  });

  return (start, end, outward, metresPerUnit) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (!length) return false;
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const retail = shops.some((shop) => {
      const x = (shop.x - midX) * metresPerUnit;
      const y = (shop.y - midY) * metresPerUnit;
      const along = Math.abs((x * dx + y * dy) / length);
      const across = x * outward.x + y * outward.y;
      return (
        along < length * metresPerUnit * 0.5 + 6 && across > -23 && across < 1.4
      );
    });
    if (!retail) return false;

    // An interior retail point is only a frontage hint if this wall faces a
    // nearby public street. This keeps shop windows off backs and courtyards.
    return roads.some(
      ({ start: road, dx: rx, dy: ry, length: streetLength }) => {
        if (Math.abs(dx * rx + dy * ry) < length * streetLength * 0.7)
          return false;
        const t = Math.min(
          1,
          Math.max(
            0,
            ((midX - road.x) * rx + (midY - road.y) * ry) / streetLength ** 2,
          ),
        );
        const x = (road.x + t * rx - midX) * metresPerUnit;
        const y = (road.y + t * ry - midY) * metresPerUnit;
        const distance = Math.hypot(x, y);
        return (
          distance >= 1.5 &&
          distance < 23 &&
          x * outward.x + y * outward.y > 0.72 * distance
        );
      },
    );
  };
}

export const shopfrontFragmentShader = `
vec3 shadeShopfront(vec2 metres, vec3 stone, float modern, float wallLight) {
  float spacing = mix(6.0, 6.9, modern);
  float bay = metres.x / spacing;
  float unit = floor(bay);
  float space = fract(bay);
  float y = metres.y;
  float aa = clamp(length(fwidth(vec2(bay, y / 4.0))) * 0.58, 0.007, 0.13);
  float seed = fract(sin(unit * 29.7 + wallLight * 32.9) * 1738.19);
  vec3 enamel = mix(vec3(0.13, 0.21, 0.19), vec3(0.24, 0.17, 0.14), smoothstep(0.25, 0.8, seed));
  enamel = mix(enamel, vec3(0.19, 0.22, 0.23), modern * 0.72);
  float edge = min(space, 1.0 - space);
  float pier = 1.0 - smoothstep(0.032, 0.056 + aa, edge);
  float cornice = smoothstep(3.51, 3.61, y) * (1.0 - smoothstep(3.69, 3.82, y));
  float door = 1.0 - smoothstep(0.105, 0.105 + aa, abs(space - 0.77));
  float stallriser = mix(0.42, 0.05, door);
  float display = smoothstep(stallriser - 0.08, stallriser + 0.08, y) *
                  (1.0 - smoothstep(2.98, 3.09, y)) *
                  smoothstep(0.058, 0.088 + aa, edge);
  vec3 glass = mix(vec3(0.13, 0.17, 0.17), vec3(0.39, 0.45, 0.42), smoothstep(0.35, 2.95, y));
  float inside = smoothstep(0.62, 0.93, y) * (1.0 - smoothstep(1.86, 2.67, y));
  glass = mix(glass, vec3(0.52, 0.41, 0.30), inside * (0.15 + 0.25 * seed) * (1.0 - door));
  float sash = 1.0 - smoothstep(0.014, 0.014 + aa, abs(space - 0.53));
  float transom = 1.0 - smoothstep(0.035, 0.105, abs(y - 2.18));
  glass = mix(glass * (1.0 - door * 0.28), enamel * 1.42, max(sash, transom * 0.75));
  vec3 front = mix(enamel, glass, display);
  front *= mix(0.76, 1.0, smoothstep(0.0, 0.21, y));
  return mix(front, stone * mix(0.88, 1.22, cornice), max(pier, cornice));
}
`;
