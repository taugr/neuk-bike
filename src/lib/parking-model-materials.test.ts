import { describe, expect, it } from 'vitest';
import { parkingModelCatalog } from './parking-model-catalog';
import { createParkingMesh, satelliteParkingColor } from './parking-model-mesh';

describe('satellite model materials', () => {
  it.each(parkingModelCatalog.map(({ kind }) => kind))(
    'preserves %s geometry and gives every material readable satellite contrast',
    (kind) => {
      const street = createParkingMesh(kind, true);
      const satellite = createParkingMesh(kind, true, false, true);
      for (const part of ['opaque', 'glass'] as const) {
        const before = street[part],
          after = satellite[part];
        expect(after.length).toBe(before.length);
        let geometryUnchanged = true,
          materialsValid = true;
        for (let i = 0; i < before.length; i += 10) {
          for (let j = 0; j < 6; j++)
            geometryUnchanged &&= before[i + j] === after[i + j];
          for (let j = 6; j < 10; j++)
            materialsValid &&= after[i + j] >= 0 && after[i + j] <= 1;
          const lightness =
            after[i + 6] * 0.2126 +
            after[i + 7] * 0.7152 +
            after[i + 8] * 0.0722;
          materialsValid &&= lightness >= 0.5599;
          materialsValid &&=
            part === 'opaque'
              ? after[i + 9] === 1
              : after[i + 9] > before[i + 9] && after[i + 9] < 0.5;
        }
        expect(geometryUnchanged).toBe(true);
        expect(materialsValid).toBe(true);
      }
    },
  );
  it('keeps the default street materials unchanged when satellite is explicitly off', () => {
    expect(createParkingMesh('stands', true, true, false)).toEqual(
      createParkingMesh('stands', true, true),
    );
    expect(createParkingMesh('bench', false, false, false)).toEqual(
      createParkingMesh('bench', false),
    );
  });
  it('retains warm wood, teal selection and opaque paint while strengthening glass', () => {
    const wood = satelliteParkingColor([0.48, 0.31, 0.16, 1]);
    expect(wood[0]).toBeGreaterThan(wood[1]);
    expect(wood[1]).toBeGreaterThan(wood[2]);
    const selected = satelliteParkingColor([20 / 255, 184 / 255, 166 / 255, 1]);
    expect(selected[1]).toBeGreaterThan(selected[0] * 2);
    expect(satelliteParkingColor([0.94, 0.96, 0.92, 1])).toEqual([
      0.94, 0.96, 0.92, 1,
    ]);
    expect(satelliteParkingColor([0.67, 0.86, 0.89, 0.26])[3]).toBe(0.42);
  });
});
