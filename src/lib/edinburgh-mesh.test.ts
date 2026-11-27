import { LngLatBounds, MercatorCoordinate } from 'maplibre-gl';
import { expect, it } from 'vitest';
import {
  edinburghCityOverviewViewport,
  edinburghMeshViewport,
  edinburghOverviewTileLimit,
  edinburghOverviewTransition,
  edinburghOverviewViewport,
  selectEdinburghMeshViewport,
} from './edinburgh-buildings';
import {
  materialRoofStride,
  roofTileExtent,
  wallOriginTile,
} from './map-aerial-roof-geometry';
import { decodeEdinburghMesh, encodeEdinburghMesh } from './edinburgh-mesh';
import {
  decodeEdinburghOverview,
  edinburghCityOverviewZoom,
  edinburghOverviewChild,
  edinburghOverviewHeaderBytes,
  edinburghOverviewRanges,
  edinburghOverviewZoom,
} from './edinburgh-overview-mesh';
import { wallVertexStride } from './map-aerial-walls';

it('decodes quantized roof vertices at the correct absolute elevation and map position', () => {
  const x = 32189;
  const y = 20422;
  const roofX = ((x + 0.5) * 4 - wallOriginTile.x) * roofTileExtent;
  const roofY = ((y + 0.5) * 4 - wallOriginTile.y) * roofTileExtent;
  const vertex = [roofX + 16, roofY + 32, 82.9, 0, 0.5, 0, 3, 0, -0.5, 1, 0];
  expect(vertex).toHaveLength(materialRoofStride);
  const bytes = encodeEdinburghMesh(
    {
      roofs: [...vertex, ...vertex, ...vertex],
      walls: [],
      outlines: [],
      buildings: 7,
      surveyed: 4,
    },
    x,
    y,
  );
  const mesh = decodeEdinburghMesh(bytes, x, y);
  expect(mesh.buildings).toBe(7);
  expect(mesh.surveyed).toBe(4);
  expect([...mesh.roofs.indices]).toEqual([0, 0, 0]);
  mesh.roofs.vertices.forEach((value, i) => {
    expect(value).toBeCloseTo(vertex[i], 3);
  });
  expect(() => decodeEdinburghMesh(bytes.slice(0, -2), x, y)).toThrow(
    'sections',
  );
});

it('decodes a dense wall section whose indices exceed 16 bits', () => {
  const x = 32184;
  const y = 20422;
  const roofX = ((x + 0.5) * 4 - wallOriginTile.x) * roofTileExtent;
  const roofY = ((y + 0.5) * 4 - wallOriginTile.y) * roofTileExtent;
  const first = [roofX, roofY, 65, 0, 0, 0.8, 0, 3, 2, -1, -1, -1];
  expect(first).toHaveLength(wallVertexStride);
  const walls = [];
  for (let i = 0; i <= 65536; i++) {
    walls.push(
      roofX + (i % 257) * 4,
      roofY + Math.floor(i / 257) * 4,
      ...first.slice(2),
    );
  }
  walls.push(...first);
  const mesh = decodeEdinburghMesh(
    encodeEdinburghMesh(
      { roofs: [], walls, outlines: [], buildings: 1, surveyed: 1 },
      x,
      y,
    ),
    x,
    y,
  );
  expect(mesh.walls.vertices).toHaveLength(walls.length - wallVertexStride);
  expect(mesh.walls.indices.at(-2)).toBe(65536);
  expect(mesh.walls.indices.at(-1)).toBe(0);
});

it('requests at most nine city chunks, prioritising the view centre', () => {
  const bounds = new LngLatBounds([-3.5, 55.8], [-3.0, 56.05]);
  const center = MercatorCoordinate.fromLngLat([-3.19, 55.95]);
  const cx = Math.floor(center.x * 2 ** 16);
  const cy = Math.floor(center.y * 2 ** 16);
  const available = new Set<string>();
  for (let x = cx - 4; x <= cx + 4; x++)
    for (let y = cy - 4; y <= cy + 4; y++) available.add(`${x}/${y}`);
  const view = edinburghMeshViewport(bounds, center, available);
  expect(view.tiles).toHaveLength(9);
  expect(view.tiles[0]).toBe(`${cx}/${cy}`);
  expect(edinburghMeshViewport(bounds, center, available, 0).tiles).toEqual([
    `${cx}/${cy}`,
  ]);
  expect(edinburghMeshViewport(bounds, center, new Set()).tiles).toEqual([]);
});

it.each([edinburghOverviewZoom, edinburghCityOverviewZoom])(
  'decodes zoom-%i overview coordinates and skips children drawn at higher detail',
  (zoom) => {
    const x = zoom === edinburghOverviewZoom ? 8046 : 4023;
    const y = zoom === edinburghOverviewZoom ? 5105 : 2552;
    const childZoom =
      zoom === edinburghOverviewZoom ? 16 : edinburghOverviewZoom;
    const childScale = 2 ** (childZoom - zoom);
    const scale = 2 ** (wallOriginTile.z - zoom);
    const roofX = ((x + 0.5) * scale - wallOriginTile.x) * roofTileExtent;
    const roofY = ((y + 0.5) * scale - wallOriginTile.y) * roofTileExtent;
    const vertex = [roofX + 16, roofY + 32, 82.9, 0, 0.5, 0, 3, 0, -0.5, 1, 0];
    const mesh = encodeEdinburghMesh(
      {
        roofs: Array.from({ length: 9 }, () => vertex).flat(),
        walls: [],
        outlines: [],
        buildings: 3,
        surveyed: 3,
      },
      x,
      y,
      zoom,
    );
    const bytes = new ArrayBuffer(
      edinburghOverviewHeaderBytes + mesh.byteLength,
    );
    const header = new Uint32Array(bytes, 0, 32);
    header.fill(3, 0, 1);
    header.fill(6, 1, 2);
    header.fill(9, 2, 16);
    new Uint8Array(bytes, edinburghOverviewHeaderBytes).set(
      new Uint8Array(mesh),
    );
    const overview = decodeEdinburghOverview(bytes, x, y, zoom);
    expect(overview.roofEnds.buffer).not.toBe(bytes);
    expect(overview.wallEnds.buffer.byteLength).toBe(
      edinburghOverviewHeaderBytes,
    );
    expect(overview.mesh.roofs.vertices[0]).toBe(vertex[0]);
    expect(edinburghOverviewRanges(overview.roofEnds, 0)).toEqual([
      { first: 0, count: 9 },
    ]);
    const child = edinburghOverviewChild(
      x * childScale + 1,
      y * childScale,
      childZoom,
      zoom,
    );
    expect(child.parent).toBe(`${x}/${y}`);
    expect(edinburghOverviewRanges(overview.roofEnds, 1 << child.slot)).toEqual(
      [
        { first: 0, count: 3 },
        { first: 6, count: 3 },
      ],
    );
    header[15] = 12;
    expect(() => decodeEdinburghOverview(bytes, x, y, zoom)).toThrow(
      'tile ranges',
    );
  },
);

it('uses the city overview to fill districts outside the neighbourhood mesh window', () => {
  const bounds = new LngLatBounds([-3.5, 55.8], [-3.0, 56.05]);
  const center = MercatorCoordinate.fromLngLat([-3.19, 55.95]);
  const x = Math.floor(center.x * 2 ** edinburghCityOverviewZoom);
  const y = Math.floor(center.y * 2 ** edinburghCityOverviewZoom);
  const cost = { bytes: 128_000, triangles: 20_000 };
  const central = `${x}/${y}`;
  const outlying = `${x + 1}/${y}`;
  const city = { [central]: cost, [outlying]: cost };
  const centralChild = `${2 * x}/${2 * y}`;
  const outlyingChild = `${2 * (x + 1)}/${2 * y}`;
  const neighbourhoods = { [centralChild]: cost, [outlyingChild]: cost };
  expect(
    edinburghCityOverviewViewport(
      bounds,
      center,
      city,
      neighbourhoods,
      new Set([centralChild]),
    ),
  ).toEqual([outlying]);
  expect(
    edinburghCityOverviewViewport(
      bounds,
      center,
      city,
      neighbourhoods,
      new Set(),
    ),
  ).toEqual([central, outlying]);
});

it('bounds the overview by the viewport, request count and geometry cost', () => {
  const bounds = new LngLatBounds([-3.5, 55.8], [-3.0, 56.05]);
  const center = MercatorCoordinate.fromLngLat([-3.19, 55.95]);
  const x = Math.floor(center.x * 2 ** edinburghOverviewZoom);
  const y = Math.floor(center.y * 2 ** edinburghOverviewZoom);
  const index: Record<string, { bytes: number; triangles: number }> = {
    '0/0': { bytes: 1, triangles: 1 },
  };
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++)
      index[`${x + i}/${y + j}`] = { bytes: 128_000, triangles: 20_000 };
  const tiles = edinburghOverviewViewport(bounds, center, index);
  expect(tiles).toHaveLength(edinburghOverviewTileLimit);
  expect(tiles[0]).toBe(`${x}/${y}`);
  expect(tiles).not.toContain('0/0');

  for (const cost of Object.values(index)) cost.triangles = 250_000;
  expect(edinburghOverviewViewport(bounds, center, index)).toHaveLength(4);
});

it('holds overlapping meshes during a pan until the replacement is ready without exceeding the tile budget', () => {
  const x = 4023;
  const y = 2552;
  const scale = 2 ** edinburghCityOverviewZoom;
  const nw = new MercatorCoordinate((x + 0.75) / scale, (y + 0.1) / scale);
  const se = new MercatorCoordinate((x + 2.25) / scale, (y + 0.9) / scale);
  const bounds = new LngLatBounds(nw.toLngLat(), se.toLngLat());
  const previous = `${x}/${y}`;
  const next = `${x + 1}/${y}`;
  const distant = `${x - 1}/${y}`;
  const pending = `${x + 2}/${y}`;
  const cost = { bytes: 2_000_000, triangles: 650_000 };
  const index = { [previous]: cost, [next]: cost, [pending]: cost };
  const ready = new Map([
    [previous, true],
    [next, true],
    [distant, true],
  ]);
  const visible = () =>
    edinburghOverviewTransition(
      [next, pending],
      [previous, distant],
      ready,
      new Set(),
      bounds,
      index,
      edinburghCityOverviewZoom,
    );
  expect(visible()).toEqual([previous, next]);
  ready.set(pending, true);
  expect(visible()).toEqual([next, pending]);
});

it('keeps the existing window during a pan until its replacement is ready', () => {
  const bounds = new LngLatBounds([-3.5, 55.8], [-3.0, 56.05]);
  const scale = 2 ** 16;
  const center = MercatorCoordinate.fromLngLat([-3.19, 55.95]);
  const x = Math.floor(center.x * scale);
  const y = Math.floor(center.y * scale);
  const first = `${x}/${y}`;
  const next = `${x + 1}/${y}`;
  const adjacent = `${x + 2}/${y}`;
  const available = new Set([first, next, adjacent]);
  const moved = new MercatorCoordinate(center.x + 1 / scale, center.y);
  const displayed = edinburghMeshViewport(bounds, center, available, 0);
  const requested = edinburghMeshViewport(bounds, moved, available);
  const nearest = edinburghMeshViewport(bounds, moved, available, 0);
  // The centre is already cached, but another tile in this window is pending.
  const loaded = new Map([
    [first, {}],
    [next, {}],
  ]);
  const missing = new Set<string>();
  expect(
    selectEdinburghMeshViewport(requested, nearest, displayed, loaded, missing),
  ).toBe(displayed);
  expect(
    selectEdinburghMeshViewport(requested, nearest, undefined, loaded, missing),
  ).toBe(nearest);
  loaded.set(adjacent, {});
  expect(
    selectEdinburghMeshViewport(requested, nearest, displayed, loaded, missing),
  ).toBe(requested);
  expect(
    selectEdinburghMeshViewport(nearest, nearest, requested, loaded, missing),
  ).toBe(requested);
  expect(
    selectEdinburghMeshViewport(
      undefined,
      undefined,
      requested,
      loaded,
      missing,
    ),
  ).toBeUndefined();
});
