import { MercatorCoordinate } from 'maplibre-gl';
import { expect, it } from 'vitest';
import { buildAerialBuildings } from './map-aerial-roof-geometry';
import { createShopfrontMatcher } from './map-aerial-shopfronts';
import { wallVertexStride } from './map-aerial-walls';

const origin = MercatorCoordinate.fromLngLat([-3.1902, 55.95311]);
const units = origin.meterInMercatorCoordinateUnits();
const point = ([x, y]: number[]) =>
  new MercatorCoordinate(origin.x + x * units, origin.y + y * units);
const lngLat = (offset: number[]) => point(offset).toLngLat().toArray();
const princesStreet = {
  geometry: {
    type: 'LineString',
    coordinates: [lngLat([-30, 11]), lngLat([30, 11])],
  },
  properties: { name: 'Princes Street' },
};
const shop = {
  geometry: { type: 'Point', coordinates: lngLat([0, -5]) },
  properties: { class: 'shop', level: 0 },
};

it('matches street-facing shops and omits upper floors, basements and courtyards', () => {
  const nearFront = (matcher: ReturnType<typeof createShopfrontMatcher>) =>
    matcher(point([-4, 0]), point([4, 0]), { x: 0, y: 1 }, 1 / units);
  const matcher = createShopfrontMatcher([princesStreet], [shop]);
  expect(nearFront(matcher)).toBe(true);
  expect(
    matcher(point([-4, -12]), point([4, -12]), { x: 0, y: -1 }, 1 / units),
  ).toBe(false);
  expect(
    matcher(point([20, 0]), point([26, 0]), { x: 0, y: 1 }, 1 / units),
  ).toBe(false);
  expect(nearFront(createShopfrontMatcher([], [shop]))).toBe(false);
  expect(
    nearFront(
      createShopfrontMatcher(
        [princesStreet],
        [
          { ...shop, properties: { class: 'shop', level: -1 } },
          { ...shop, properties: { class: 'shop', level: 1 } },
        ],
      ),
    ),
  ).toBe(false);
});

it('anchors shopfront vertices to the surveyed pavement in front of the building', () => {
  const building = {
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-6, 0],
          [6, 0],
          [6, -12],
          [-6, -12],
          [-6, 0],
        ].map(lngLat),
      ],
    },
    properties: { render_height: 15 },
  };
  const { walls, shopfrontSegments } = buildAerialBuildings(
    [building],
    () => 52,
    {
      materials: true,
      shopfront: createShopfrontMatcher([princesStreet], [shop]),
      survey: ({ y }) => ({ roof: 72, ground: y > origin.y + units ? 58 : 53 }),
    },
  );
  expect(shopfrontSegments).toBeGreaterThan(0);
  expect(shopfrontSegments * 6 * wallVertexStride).toBeLessThan(walls.length);
  for (let i = 0; i < walls.length; i += wallVertexStride) {
    if (!walls[i + 9]) continue;
    expect(walls[i + 2] - walls[i + 8]).toBeCloseTo(58);
  }
});
