import { expect, it } from 'vitest';
import {
  blocksBuildingPrism,
  collectNearbyBuildingTriangles,
  findClearBuildingBearing,
  parkingCameraOffset,
  type BuildingTriangle,
} from './map-building-occlusion';
import { isNearEdinburghBuildings } from './edinburgh-building-area';

const target = [0, 0, 1] as const;
const camera = [0, 50, 30] as const;
const wall: BuildingTriangle = [
  [-4, 10, 0],
  [4, 10, 0],
  [4, 10, 24],
];

it('accounts for the popup offset and target bearing when planning the view', () => {
  const camera = {
    pitch: 45,
    bearing: 0,
    zoom: 17,
    offset: [0, 0] as [number, number],
  };
  const [, centeredSouth, height] = parkingCameraOffset(camera, 600);
  const [east, south, shiftedHeight] = parkingCameraOffset(
    { ...camera, bearing: 90, offset: [0, 120] },
    600,
  );
  expect(south).toBeCloseTo(0);
  expect(east).toBeLessThan(0);
  expect(Math.abs(east)).toBeLessThan(centeredSouth);
  expect(shiftedHeight).toBe(height);
});

it('keeps the bearing when the visible parking has a building behind it', () => {
  expect(
    findClearBuildingBearing(target, [0, -50, 30], 180, [wall]),
  ).toBeNull();
});

it('turns to the nearest clear ray when a wall hides the selected parking', () => {
  expect(findClearBuildingBearing(target, camera, 0, [wall])).toBe(20);
});

it('keeps the current view when a roof hides the parking at every bearing', () => {
  const roof: BuildingTriangle[] = [
    [
      [-120, -120, 5],
      [120, -120, 5],
      [120, 120, 5],
    ],
    [
      [-120, -120, 5],
      [120, 120, 5],
      [-120, 120, 5],
    ],
  ];
  expect(findClearBuildingBearing(target, camera, 0, roof)).toBeNull();
});

it('queries only the active index ranges of the streamed mesh', () => {
  const nearby: BuildingTriangle[] = [];
  const vertices = new Float32Array(wall.flat());
  const indices = new Uint16Array([0, 1, 2, 0, 2, 1]);
  collectNearbyBuildingTriangles(
    nearby,
    vertices,
    indices,
    3,
    target,
    50,
    3,
    3,
  );
  expect(nearby).toEqual([[wall[0], wall[2], wall[1]]]);
});

it('finds an OpenFreeMap wall and respects the open space under a raised building', () => {
  const rings: [number, number][][] = [
    [
      [-4, 10],
      [4, 10],
      [4, 20],
      [-4, 20],
      [-4, 10],
    ],
  ];
  expect(blocksBuildingPrism([0, 50, 24], { rings, base: 0, roof: 15 })).toBe(
    true,
  );
  expect(blocksBuildingPrism([0, 50, 24], { rings, base: 12, roof: 24 })).toBe(
    false,
  );
  expect(blocksBuildingPrism([0, -50, 24], { rings, base: 0, roof: 15 })).toBe(
    false,
  );
});

it('selects surveyed tiles around Edinburgh and standard terrain elsewhere', () => {
  expect(isNearEdinburghBuildings([-3.3975, 55.9905])).toBe(true);
  expect(isNearEdinburghBuildings([-3.1134, 55.9532])).toBe(true);
  expect(isNearEdinburghBuildings([44.5152, 40.1829])).toBe(false);
});
