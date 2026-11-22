import { expect, it } from 'vitest';
import { appendAerialWalls, wallVertexStride } from './map-aerial-walls';
import { facadeJointFractions } from './map-terrace-joints';

it('aligns a terrace division across the front and rear and skips parallel walls', () => {
  const joints = {
    partyWalls: [
      { x: 0.1, y: 0.15 },
      { x: 10, y: 0.5 },
    ],
    divisions: [
      [
        { x: 8, y: -1 },
        { x: 8, y: 13 },
      ],
    ] as const,
  };
  expect(
    facadeJointFractions({ x: 0, y: 0 }, { x: 20, y: 0 }, 20, joints),
  ).toEqual([0, 0.4]);
  expect(
    facadeJointFractions({ x: 20, y: 12 }, { x: 0, y: 12 }, 20, joints),
  ).toEqual([0.6]);
  expect(
    facadeJointFractions({ x: 8, y: 2 }, { x: 8, y: 8 }, 6, joints),
  ).toEqual([]);
});

it('adds relief to both sides of a division without changing the surveyed eave', () => {
  const walls: number[] = [];
  appendAerialWalls(
    walls,
    [
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 12 },
        { x: 0, y: 12 },
      ],
    ],
    {
      height: 12,
      base: 0,
      terrain: 0,
      origin: { x: 0, y: 0 },
      tileScale: 1,
      metresPerUnit: 1,
      material: 0,
      facadeJoints: {
        partyWalls: [],
        divisions: [
          [
            { x: 8, y: -1 },
            { x: 8, y: 13 },
          ],
        ],
      },
      profile: ({ x }) => 10 + x ** 2 / 100,
      photoGate: false,
      step: 20,
    },
  );
  const seam = [];
  for (let i = 0; i < walls.length; i += wallVertexStride) {
    const [x, y, elevation, , , , , belowEave, , tone, left, right] =
      walls.slice(i, i + wallVertexStride);
    if (x === 8 && y === 0 && belowEave === 0)
      seam.push({ elevation, tone, left, right });
  }
  expect(seam).toEqual(
    expect.arrayContaining([
      { elevation: 11.6, tone: -1, left: -1, right: 0 },
      { elevation: 11.6, tone: -2, left: 0, right: -1 },
    ]),
  );
});
