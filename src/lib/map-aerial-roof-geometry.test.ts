import { LngLatBounds, MercatorCoordinate } from 'maplibre-gl';
import { expect, it } from 'vitest';
import frontage from '@/data/princes-street-facades.json';
import {
  buildAerialBuildings,
  materialRoofStride,
  roofDetailTilesInView,
  roofTileKey,
  roofImageryZoom,
  roofTileExtent,
  roofTriangles,
} from './map-aerial-roof-geometry';
import {
  appendAerialWalls,
  roofOutlineStride,
  wallVertexStride,
  waverleyGatePhotoCoordinates,
} from './map-aerial-walls';
import { fitPrincesStreetCornice } from './princes-street-architecture';

it('places measured bands on the street wall at their surveyed elevations', () => {
  const west = MercatorCoordinate.fromLngLat([
    frontage.west[0],
    frontage.west[1],
  ]);
  const east = MercatorCoordinate.fromLngLat([
    frontage.east[0],
    frontage.east[1],
  ]);
  const unit = west.meterInMercatorCoordinateUnits();
  const ring = [
    west,
    east,
    { x: east.x, y: east.y - 10 * unit },
    { x: west.x, y: west.y - 10 * unit },
  ];
  const vertices: number[] = [];
  const wall = appendAerialWalls(vertices, [ring], {
    height: 26,
    base: 0,
    terrain: 66,
    origin: west,
    tileScale: 1 / unit,
    metresPerUnit: 1 / unit,
    material: 0,
    profile: () => 92,
    photoGate: false,
    surveyFrontage: true,
    step: 4 * unit,
  });
  expect(wall.measuredBands).toBe(6);
  const elevations = vertices.filter(
    (_, index) => index % wallVertexStride === 2,
  );
  expect(elevations.some((value) => Math.abs(value - 81.75) < 1e-8)).toBe(true);
});

it('cuts the traced street openings into the wall and leaves adjoining walls plain', () => {
  const west = MercatorCoordinate.fromLngLat(frontage.west as [number, number]);
  const east = MercatorCoordinate.fromLngLat(frontage.east as [number, number]);
  const unit = west.meterInMercatorCoordinateUnits();
  const ring = [
    west,
    east,
    { x: east.x, y: east.y - 10 * unit },
    { x: west.x, y: west.y - 10 * unit },
  ];
  const vertices: number[] = [];
  const wall = appendAerialWalls(vertices, [ring], {
    height: 26,
    base: 0,
    terrain: 66,
    origin: west,
    tileScale: 1 / unit,
    metresPerUnit: 1 / unit,
    material: 0,
    profile: () => 92,
    photoGate: false,
    modeledFrontage: true,
    step: 4 * unit,
  });
  expect(wall.modeledOpenings).toBeGreaterThan(75);
  expect(wall.includesFrontage).toBe(false);
  expect(wall.includesPhoto).toBe(false);
  const projectedDepths: number[] = [];
  const materials = new Set<number>();
  const normalY =
    (east.x - west.x) / Math.hypot(east.x - west.x, east.y - west.y);
  for (let i = 0; i < vertices.length; i += wallVertexStride) {
    const material = vertices[i + 8];
    materials.add(material);
    if (material === 6) {
      const streetY = (vertices[i] * (east.y - west.y)) / (east.x - west.x);
      projectedDepths.push((vertices[i + 1] - streetY) * normalY);
    }
  }
  expect(materials).toEqual(new Set(Array.from({ length: 16 }, (_, i) => i)));
  expect(projectedDepths.some((depth) => depth < -0.43 && depth > -0.45)).toBe(
    true,
  );
  expect(projectedDepths.some((depth) => depth < -0.65 && depth > -0.67)).toBe(
    true,
  );
  expect(Math.min(...projectedDepths)).toBeLessThan(-0.9);
  expect(Math.max(...projectedDepths)).toBeGreaterThan(0.3);
});

it('raises the rounded survey edge to the traced cornice only at street-facing eaves', () => {
  const west = MercatorCoordinate.fromLngLat(frontage.west as [number, number]);
  const east = MercatorCoordinate.fromLngLat(frontage.east as [number, number]);
  const unit = west.meterInMercatorCoordinateUnits();
  const point = (u: number, depth: number) => ({
    x: west.x + (east.x - west.x) * u,
    y: west.y + (east.y - west.y) * u - depth * unit,
  });
  const ring = [point(0, 0), point(0.2, 0), point(0.2, 12), point(0, 12)];
  const measured = ({ x, y }: { x: number; y: number }) =>
    y < point((x - west.x) / (east.x - west.x), 3).y ? 84 : 76;
  const profile = fitPrincesStreetCornice(ring, 1 / unit, measured);
  expect(profile(point(0.1, 0))).toBeCloseTo(82, 1);
  expect(profile(point(0.1, 2))).toBeGreaterThan(76);
  expect(profile(point(0.1, 5))).toBe(84);
});

it('follows concave roofs and cuts out courtyards', () => {
  const outline = [
    [0, 0],
    [8, 0],
    [8, 3],
    [5, 3],
    [5, 6],
    [0, 6],
  ];
  const courtyard = [
    [1, 1],
    [3, 1],
    [3, 4],
    [1, 4],
  ];
  const triangles = roofTriangles(
    [outline, courtyard].map((ring) => ring.map(([x, y]) => ({ x, y }))),
  );
  const area = triangles.reduce(
    (sum, [a, b, c]) =>
      sum + Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2,
    0,
  );
  expect(area).toBe(8 * 6 - 3 * 3 - 2 * 3);
});

it('aligns a roof across imagery tile edges and ignores duplicate building fragments', () => {
  const center = MercatorCoordinate.fromLngLat([-3.1883, 55.9533]);
  const tilesPerAxis = 2 ** roofImageryZoom;
  const x = Math.floor(center.x * tilesPerAxis);
  const y = Math.floor(center.y * tilesPerAxis);
  const ring = [
    [x - 0.1, y + 0.2],
    [x + 0.1, y + 0.2],
    [x + 0.1, y + 0.4],
    [x - 0.1, y + 0.4],
    [x - 0.1, y + 0.2],
  ].map(([tileX, tileY]) =>
    new MercatorCoordinate(tileX / tilesPerAxis, tileY / tilesPerAxis)
      .toLngLat()
      .toArray(),
  );
  const building = {
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: { render_height: 15 },
  };
  const getTerrainElevation = () => 40;
  const meshes = buildAerialBuildings(
    [building, building],
    getTerrainElevation,
  );
  expect(meshes).toEqual(buildAerialBuildings([building], getTerrainElevation));
  const { roofs: tiles, walls } = meshes;
  expect([...tiles.keys()]).toEqual([`${x - 1}/${y}`, `${x}/${y}`]);
  // The same surface continues across the tile edge in each tile's own UV space.
  const west = tiles.get(`${x - 1}/${y}`)!.vertices;
  const east = tiles.get(`${x}/${y}`)!.vertices;
  for (let i = 0; i < west.length; i += 3) {
    expect(west[i] - east[i]).toBeCloseTo(roofTileExtent);
    expect(west[i + 1]).toBeCloseTo(east[i + 1]);
    expect(west[i + 2]).toBeCloseTo(55.15);
  }
  expect(walls).toHaveLength(4 * 6 * wallVertexStride);
  expect(walls[2]).toBe(30);
  expect(walls[2 + 2 * wallVertexStride]).toBe(55);
  expect(walls[7]).toBe(25);
  expect(walls[2 * wallVertexStride + 7]).toBe(0);
});

it('only builds photo detail for the imagery tiles in a close view', () => {
  const z = 2 ** roofImageryZoom;
  const station = MercatorCoordinate.fromLngLat([-3.1883, 55.9533]);
  const x = Math.floor(station.x * z);
  const y = Math.floor(station.y * z);
  const at = (tileX: number, tileY: number) =>
    new MercatorCoordinate(tileX / z, tileY / z).toLngLat().toArray();
  const geometry = {
    type: 'Polygon',
    coordinates: [
      [
        at(x - 0.1, y + 0.2),
        at(x + 0.1, y + 0.2),
        at(x + 0.1, y + 0.4),
        at(x - 0.1, y + 0.4),
        at(x - 0.1, y + 0.2),
      ],
    ],
  };
  const features = [{ geometry, properties: { render_height: 8 } }];
  const options = { materials: true, survey: () => ({ roof: 58, ground: 50 }) };
  expect(buildAerialBuildings(features, () => 50, options).roofs.size).toBe(0);
  const bounds = new LngLatBounds(at(x + 0.02, y + 0.8), at(x + 0.9, y + 0.02));
  const detail = buildAerialBuildings(features, () => 50, {
    ...options,
    detailTiles: roofDetailTilesInView(bounds),
  });
  expect([...detail.roofs.keys()]).toEqual([`${x}/${y}`]);
  expect(detail.roofs.get(`${x}/${y}`)!.vertices[2]).toBeCloseTo(58.12);
  expect(detail.materialRoofs.size).toBe(1);
  const detailed = buildAerialBuildings(features, () => 50, {
    ...options,
    detailTiles: roofDetailTilesInView(bounds, roofImageryZoom + 1),
  });
  expect([...detailed.roofs.keys()]).toEqual([
    roofTileKey(x * 2, y * 2, roofImageryZoom + 1),
  ]);
  expect([...detailed.roofs.values()][0].z).toBe(roofImageryZoom + 1);
});

it('tags the Princes Street roofs with metre coordinates only in the modelled preview', () => {
  const building = (lng: number, lat: number) => ({
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lng, lat],
          [lng + 0.00012, lat],
          [lng + 0.00012, lat + 0.00009],
          [lng, lat + 0.00009],
          [lng, lat],
        ],
      ],
    },
    properties: { render_height: 19 },
  });
  const features = [building(-3.19015, 55.95336), building(-3.1888, 55.95318)];
  const options = {
    materials: true,
    survey: () => ({ roof: 89.5, ground: 67 }),
    photoGate: false,
  };
  expect(buildAerialBuildings(features, () => 67, options).modeledRoofs).toBe(
    0,
  );
  const result = buildAerialBuildings(features, () => 67, {
    ...options,
    modeledFrontage: true,
  });
  expect(result.modeledRoofs).toBe(1);
  expect(result.roofs.size).toBe(0);
  const flagged = Array.from(result.materialRoofs.values()).flatMap(
    ({ vertices }) => vertices.filter((_, i) => i % materialRoofStride === 6),
  );
  expect(new Set(flagged)).toEqual(new Set([0, 2]));
});

it('maps each Waverley Gate side to its own photograph without matching offsite walls', () => {
  const corner = MercatorCoordinate.fromLngLat([-3.188846, 55.953186]);
  const north = MercatorCoordinate.fromLngLat([-3.187945, 55.953369]);
  const west = MercatorCoordinate.fromLngLat([-3.188594, 55.952711]);
  const other = MercatorCoordinate.fromLngLat([-3.1885, 55.954]);
  expect(waverleyGatePhotoCoordinates(corner, north)).toEqual({
    side: 0,
    u0: 1,
    u1: 0,
  });
  expect(waverleyGatePhotoCoordinates(corner, west)).toEqual({
    side: 1,
    u0: 0,
    u1: expect.closeTo(1),
  });
  const recessedBay = MercatorCoordinate.fromLngLat([-3.188412, 55.953249]);
  expect(waverleyGatePhotoCoordinates(corner, recessedBay)?.side).toBe(0);
  expect(waverleyGatePhotoCoordinates(corner, other)).toBeUndefined();
});

it('keeps the Waverley Gate photograph aligned through changes in surveyed roof height', () => {
  const corner = [-3.188846, 55.953186];
  const gate = {
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          corner,
          [-3.187945, 55.953369],
          [-3.187694, 55.952894],
          [-3.188594, 55.952711],
          corner,
        ],
      ],
    },
    properties: { render_height: 30 },
  };
  const middle = MercatorCoordinate.fromLngLat([-3.18837, 55.953]).x;
  const { walls, includesPhoto } = buildAerialBuildings([gate], () => 65, {
    materials: true,
    survey: ({ x }) => ({ ground: 65, roof: x < middle ? 87 : 94 }),
  });
  expect(includesPhoto).toBe(true);
  const fronts = new Set<number>();
  const photoTopElevations = new Set<number>();
  for (let i = 0; i < walls.length; i += wallVertexStride) {
    const facade = walls[i + 6];
    if (facade < 3) continue;
    fronts.add(facade);
    const elevation = walls[i + 2];
    expect(walls[i + 8]).toBeGreaterThanOrEqual(0);
    expect(walls[i + 8]).toBeLessThanOrEqual(1);
    expect(walls[i + 9]).toBeCloseTo((elevation - 67.5) / 24);
    if (walls[i + 7] === 0) photoTopElevations.add(elevation);
  }
  expect(fronts).toEqual(new Set([3, 4]));
  expect(photoTopElevations.size).toBeGreaterThan(1);
});

it('aligns the Princes Street photograph only to the street-facing wall and only when enabled', () => {
  const west = [-3.1912708, 55.9530834];
  const east = [-3.1898224, 55.9533267];
  const building = {
    geometry: {
      type: 'Polygon',
      coordinates: [
        [west, east, [-3.18991, 55.9535], [-3.19136, 55.95326], west],
      ],
    },
    properties: { render_height: 19 },
  };
  const options = {
    materials: true,
    survey: () => ({ roof: 85, ground: 67 }),
  };
  expect(
    buildAerialBuildings([building], () => 67, options).includesFrontage,
  ).toBe(false);
  const { walls, includesFrontage } = buildAerialBuildings(
    [building],
    () => 67,
    {
      ...options,
      photoFrontage: true,
    },
  );
  expect(includesFrontage).toBe(true);
  const frontageU: number[] = [];
  const untextured: number[] = [];
  for (let i = 0; i < walls.length; i += wallVertexStride) {
    const [u, v] = walls.slice(i + 10, i + 12);
    if (u === -1) untextured.push(v);
    else {
      frontageU.push(u);
      expect(v).toBeCloseTo((91 - walls[i + 2]) / 25);
    }
  }
  expect(Math.min(...frontageU)).toBeCloseTo(0);
  expect(Math.max(...frontageU)).toBeCloseTo(1);
  expect(untextured.length).toBeGreaterThan(0);
  expect(new Set(untextured)).toEqual(new Set([-1]));
});

it('batches shaded roofs with a consistent sampled colour and measured eaves', () => {
  const building = {
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-3.191, 55.9525],
          [-3.187, 55.9525],
          [-3.187, 55.952],
          [-3.191, 55.952],
          [-3.191, 55.9525],
        ],
      ],
    },
    properties: { render_height: 5 },
  };
  const { roofs, materialRoofs, outlines, walls, measuredBuildings } =
    buildAerialBuildings(
      [
        building,
        { ...building, properties: { ...building.properties, hide_3d: true } },
      ],
      () => 51,
      { materials: true, survey: () => ({ roof: 59, ground: 51 }) },
    );
  expect(measuredBuildings).toBe(1);
  expect(roofs.size).toBe(0);
  const { vertices } = [...materialRoofs.values()][0];
  expect(vertices.length / materialRoofStride).toBeGreaterThan(6);
  expect(vertices[2]).toBeCloseTo(59.12);
  expect(vertices[6]).toBe(1);
  expect(vertices[3]).toBeGreaterThanOrEqual(0);
  expect(vertices[4]).toBeLessThan(1);
  expect(vertices.slice(3, 7)).toEqual(
    vertices.slice(materialRoofStride + 3, materialRoofStride + 7),
  );
  expect(vertices[7]).toBeCloseTo(0);
  expect(vertices[8]).toBeCloseTo(0);
  expect(outlines.length / roofOutlineStride).toBe(
    walls.length / wallVertexStride,
  );
  expect(outlines[2]).toBeCloseTo(59.12);
  expect(outlines[5]).toBeCloseTo(59.12);
  expect(outlines.slice(6, 8)).toEqual([1, 1]);
  expect(
    outlines.slice(2 * roofOutlineStride + 6, 3 * roofOutlineStride),
  ).toEqual([-1, 1]);
});

it('keeps the richer footprint when vector tiles repeat an exterior', () => {
  const exterior = [
    [-3.1891, 55.9531],
    [-3.1883, 55.9531],
    [-3.1883, 55.9532],
    [-3.1891, 55.9532],
    [-3.1891, 55.9531],
  ];
  const courtyard = [
    [-3.1889, 55.95312],
    [-3.1885, 55.95312],
    [-3.1885, 55.95318],
    [-3.1889, 55.95318],
    [-3.1889, 55.95312],
  ];
  const building = {
    geometry: { type: 'Polygon', coordinates: [exterior] },
    properties: { render_height: 10 },
  };
  const withCourtyard = {
    ...building,
    geometry: { ...building.geometry, coordinates: [exterior, courtyard] },
  };
  const terrain = () => 50;
  const style = { materials: true, survey: () => ({ roof: 60, ground: 50 }) };
  const richer = buildAerialBuildings([withCourtyard], terrain, style);
  expect(
    buildAerialBuildings([building, withCourtyard], terrain, style),
  ).toEqual(richer);
  expect(richer.measuredBuildings).toBe(1);
  const { x, y, vertices } = [...richer.materialRoofs.values()][0];
  const scale = 2 ** roofImageryZoom;
  const sample = new MercatorCoordinate(
    (x + vertices[3]) / scale,
    (y + vertices[4]) / scale,
  ).toLngLat();
  const insideCourtyard =
    sample.lng > -3.1889 &&
    sample.lng < -3.1885 &&
    sample.lat > 55.95312 &&
    sample.lat < 55.95318;
  expect(insideCourtyard).toBe(false);
  expect(vertices[6]).toBe(0);
});

it('shares lighting normals across roof triangles and follows the footprint orientation', () => {
  const origin = MercatorCoordinate.fromLngLat([-3.1895, 55.954]);
  const units = origin.meterInMercatorCoordinateUnits();
  const outline = [
    [-30, -12],
    [30, -12],
    [30, 12],
    [-30, 12],
    [-30, -12],
  ].map(([x, y]) =>
    new MercatorCoordinate(origin.x + x * units, origin.y + y * units)
      .toLngLat()
      .toArray(),
  );
  const building = {
    geometry: { type: 'Polygon', coordinates: [outline] },
    properties: { render_height: 10 },
  };
  const meshes = buildAerialBuildings([building], () => 50, {
    materials: true,
    survey: ({ x }) => ({
      roof: 66 + ((x - origin.x) / units) * 0.32,
      ground: 50,
    }),
  });
  const { vertices } = [...meshes.materialRoofs.values()][0];
  const normals = new Map<string, number[]>();
  let shared = 0;
  let sloped = 0;
  for (let i = 0; i < vertices.length; i += materialRoofStride) {
    const key = vertices.slice(i, i + 2).join('/');
    const normal = vertices.slice(i + 7, i + 9);
    if (normal[0] < -0.18) sloped++;
    if (normals.has(key)) {
      expect(normal).toEqual(normals.get(key));
      shared++;
    }
    normals.set(key, normal);
    expect(vertices[i + 9]).toBeCloseTo(1);
    expect(vertices[i + 10]).toBeCloseTo(0);
  }
  expect(sloped).toBeGreaterThan(0);
  expect(shared).toBeGreaterThan(0);
});
