import { readFileSync } from 'node:fs';
import { LngLatBounds, MercatorCoordinate } from 'maplibre-gl';
import { expect, it } from 'vitest';
import survey from '@/data/edinburgh-lidar.json';
import {
  edinburghRoofTilesInView,
  edinburghTerrainTile,
  sampleEdinburghRoofTiles,
} from './edinburgh-roof-survey';
import {
  buildAerialBuildings,
  materialRoofStride,
} from './map-aerial-roof-geometry';
import { decodeRoofSamples } from './waverley-roof-profile';

function localSurvey(keys: string[]) {
  return sampleEdinburghRoofTiles(
    new Map(
      keys.map((key) => {
        const data = readFileSync(
          `public/data/edinburgh-lidar/roofs/${key}.bin`,
        );
        return [
          key,
          decodeRoofSamples(
            Uint8Array.from(data).buffer,
            survey.samples,
            survey.samples,
          ),
        ];
      }),
    ),
  );
}

it.each([
  ['Grassmarket', -3.197, 55.94735],
  ['Stockbridge', -3.2097, 55.95875],
  ['Leith Shore', -3.1693, 55.9763],
])('selects only nearby survey tiles around %s', (_, lng, lat) => {
  const bounds = new LngLatBounds(
    [lng - 0.001, lat - 0.0007],
    [lng + 0.001, lat + 0.0007],
  );
  const tiles = edinburghRoofTilesInView(bounds);
  expect(tiles).toHaveLength(4);
  const scale = 2 ** survey.zoom;
  const point = MercatorCoordinate.fromLngLat([lng, lat]);
  const x = Math.floor(point.x * scale);
  const y = Math.floor(point.y * scale);
  const ground = edinburghTerrainTile(survey.zoom, x, y);
  expect(readFileSync(`public${ground}`).subarray(1, 4).toString()).toBe('PNG');
  const sample = localSurvey(tiles)(point);
  expect(sample?.ground).toBeGreaterThan(0);
  expect(sample?.roof).toBeGreaterThan(0);
  expect(
    edinburghRoofTilesInView(new LngLatBounds([-3.23, 55.9], [-3.22, 55.91])),
  ).toEqual([]);
});

it('fits roofs across a chunk boundary and keeps unsurveyed buildings as context', () => {
  const sample = localSurvey(['64371/40849', '64372/40849']);
  const scale = 2 ** survey.zoom;
  expect(
    sample({ x: (64372 - 0.0001) / scale, y: 40849.22 / scale }),
  ).toBeDefined();
  expect(
    sample({ x: (64372 + 0.0001) / scale, y: 40849.22 / scale }),
  ).toBeDefined();
  const feature = (lng: number) => ({
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lng, 55.9473],
          [lng + 0.0002, 55.9473],
          [lng + 0.0002, 55.94745],
          [lng, 55.94745],
          [lng, 55.9473],
        ],
      ],
    },
    properties: { render_height: 15 },
  });
  const meshes = buildAerialBuildings(
    [feature(-3.1979), feature(-3.2016)],
    () => 68,
    {
      materials: true,
      survey: Object.assign(
        ({ x, y }: { x: number; y: number }) =>
          sample({ x, y }) && { ground: 68, roof: 80 },
        { grid: sample.grid },
      ),
      edinburghPilot: 'overview',
    },
  );
  expect(meshes.measuredBuildings).toBe(1);
  expect(meshes.generatedBuildings).toBe(2);
  expect(meshes.roofs.size).toBe(0);
  expect(
    [...meshes.materialRoofs.values()].every(({ vertices }) =>
      vertices.every((value, i) => i % materialRoofStride !== 6 || value === 3),
    ),
  ).toBe(true);
});
