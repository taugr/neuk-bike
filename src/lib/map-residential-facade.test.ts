import { MercatorCoordinate } from 'maplibre-gl';
import { expect, it } from 'vitest';
import { appendResidentialFacade } from './map-residential-facade';
import { stockbridgeTerraceFaces } from './stockbridge-terraces';
import { historicFacadeFaces } from './edinburgh-historic-facades';

it('identifies the street and rear walls of a mapped Malta Terrace home', () => {
  const ring = [
    [-3.209821, 55.959671],
    [-3.209724, 55.959579],
    [-3.209622, 55.959613],
    [-3.209719, 55.959705],
  ].map(([lng, lat]) => MercatorCoordinate.fromLngLat([lng, lat]));
  const center = MercatorCoordinate.fromLngLat([-3.209721, 55.959642]);
  const scale = 1 / center.meterInMercatorCoordinateUnits();
  expect(stockbridgeTerraceFaces(center, ring, scale, true)).toEqual(
    new Map([
      [1, 'front'],
      [3, 'rear'],
    ]),
  );
  expect(stockbridgeTerraceFaces(center, ring, scale, false)).toBeUndefined();
});

it('retains a mapped shop bay and a separate entrance underneath tenement windows', () => {
  const facade = historicFacadeFaces({
    district: 'old-town',
    levels: 4,
    faces: [
      [0, 'front', [0.16], [0.58]],
      [2, 'rear', [0.45], [0.45]],
    ],
  });
  expect(facade?.layouts.get(2)).toMatchObject({
    street: false,
    shops: [],
    entrances: [],
  });

  const vertices: number[] = [];
  const openingCount = appendResidentialFacade(vertices, {
    cuts: [0, 0.49, 1],
    joints: [],
    metres: 8.5,
    bottom: -1,
    street: true,
    eave: () => 11.6,
    ground: (t) => t,
    masonry: 4,
    historic: facade?.layouts.get(0),
    doorSide: true,
    vertex: (t, height, depth, _stone, _light, surface) => [
      t,
      height,
      depth,
      surface?.[2] ?? 0,
    ],
  });
  expect(openingCount).toBe(16);
  const glass = [];
  for (let i = 0; i < vertices.length; i += 4) {
    const [t, height, depth, kind] = vertices.slice(i, i + 4);
    if (kind) glass.push({ t, height, depth, kind });
  }
  const shops = glass.filter(({ kind }) => kind === 4);
  expect(shops.length).toBeGreaterThan(0);
  expect(
    shops.every(
      ({ t, depth, height }) =>
        t > 0.37 && t < 0.8 && depth === -0.43 && height < 3.5,
    ),
  ).toBe(true);
  expect(glass.some(({ t, kind }) => kind === 3 && t < 0.26)).toBe(true);
  expect(glass.some(({ height, kind }) => kind === 2 && height > 10)).toBe(
    true,
  );
});

it('cuts masonry away from the glazed openings and recesses doors only on the street face', () => {
  for (const street of [true, false]) {
    const vertices: number[] = [];
    const count = appendResidentialFacade(vertices, {
      cuts: [0, 0.45, 1],
      joints: [0, 1],
      metres: 8,
      bottom: -1,
      street,
      eave: () => 6.3,
      ground: () => 0,
      masonry: 2,
      doorSide: false,
      vertex: (t, height, depth, stone, _light, surface) => [
        t,
        height,
        depth,
        stone,
        surface?.[2] ?? 0,
      ],
    });
    expect(count).toBe(6);
    const triangles = [];
    for (let i = 0; i < vertices.length; i += 15) {
      triangles.push([
        vertices.slice(i, i + 5),
        vertices.slice(i + 5, i + 10),
        vertices.slice(i + 10, i + 15),
      ]);
    }
    expect(
      triangles.some((triangle) =>
        triangle.every((vertex) => vertex[2] === -0.36 && vertex[4] === 2),
      ),
    ).toBe(true);
    expect(
      triangles.some((triangle) =>
        triangle.every((vertex) => vertex[2] === -0.51 && vertex[4] === 3),
      ),
    ).toBe(street);
    expect(
      triangles.some(
        (triangle) =>
          triangle.every((vertex) => vertex[2] === 0) &&
          triangle.reduce((sum, vertex) => sum + vertex[0], 0) / 3 < 0.21 &&
          triangle.reduce((sum, vertex) => sum + vertex[0], 0) / 3 > 0.065 &&
          triangle.reduce((sum, vertex) => sum + vertex[1], 0) / 3 > 0.9 &&
          triangle.reduce((sum, vertex) => sum + vertex[1], 0) / 3 < 2.5,
      ),
    ).toBe(false);
  }
});
