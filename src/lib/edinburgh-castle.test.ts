import { expect, it } from 'vitest';
import { appendGatehouse } from '../../scripts/edinburgh-castle-gatehouse';
import {
  buildEdinburghCastle,
  type Point,
} from '../../scripts/edinburgh-castle-geometry';
import { wallVertexStride } from './map-aerial-walls';

it('cuts the Gatehouse arch through both ends and builds the connected span', () => {
  const faces: (readonly Point[])[] = [];
  appendGatehouse((face) => faces.push(face), 9.86);
  for (const end of [-0.15, 9.86]) {
    const center = faces.filter((face) =>
      face.every(([x, y]) => Math.abs(x) <= 2.25 && y === end),
    );
    expect(center.length).toBeGreaterThan(12);
    expect(center.every((face) => face.every(([, , z]) => z >= 2.28))).toBe(
      true,
    );
  }
  for (const [start, end] of [
    [-10.7, -0.15],
    [-0.15, 9.86],
  ]) {
    expect(
      faces.some(
        (face) =>
          face.some(([, depth, z]) => depth === start && z < 0.1) &&
          face.some(([, depth, z]) => depth === end && z < 0.1),
      ),
    ).toBe(true);
  }
});

it('packs the survey-aligned model into ordinary city wall sections', () => {
  const tiles = buildEdinburghCastle();
  expect(tiles.size).toBeGreaterThan(1);
  expect(tiles.size).toBeLessThanOrEqual(6);
  for (const walls of tiles.values()) {
    expect(walls.length % (wallVertexStride * 3)).toBe(0);
    for (let i = 0; i < walls.length; i += wallVertexStride) {
      expect(walls[i + 2]).toBeGreaterThan(75);
      expect(walls[i + 2]).toBeLessThan(150);
      expect(walls[i + 9]).toBe(-4);
    }
  }
});
