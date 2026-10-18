import {
  parkingModelCatalog,
  resolveParkingModelType,
  parkingModelHasCover,
} from './parking-model-catalog';
import { describe, expect, it } from 'vitest';
import {
  buildParkingModels,
  createParkingMesh,
  parkingModelButtonOffset,
} from './parking-models';
import type { ParkingPoint } from './types';
const point = (
  type: string | null,
  covered: string | null = null,
): ParkingPoint => ({
  id: 'test',
  name: 'Test',
  latitude: 55.95,
  longitude: -3.19,
  sourceId: 'osm',
  properties: { bicycle_pa: type, covered },
});

describe('smooth parking meshes', () => {
  it.each(parkingModelCatalog.map(({ kind }) => kind))(
    'builds finite triangles with unit normals for %s',
    (kind) => {
      const mesh = createParkingMesh(kind, true);
      for (const vertices of [mesh.opaque, mesh.glass]) {
        expect(vertices.length % 30).toBe(0);
        for (let i = 0; i < vertices.length; i += 10) {
          expect([...vertices.slice(i, i + 10)].every(Number.isFinite)).toBe(
            true,
          );
          expect(Math.hypot(...vertices.slice(i + 3, i + 6))).toBeCloseTo(1, 5);
          expect(vertices[i + 2]).toBeGreaterThanOrEqual(-0.02);
        }
      }
      expect(mesh.opaque.length).toBeGreaterThan(100);
    },
  );
  it('uses round tubing with smoothly varying normals instead of rectangular stand bars', () => {
    const vertices = createParkingMesh('stands', false).opaque;
    const normals = new Set<string>();
    for (let i = 0; i < vertices.length; i += 10)
      normals.add(
        [...vertices.slice(i + 3, i + 6)].map((v) => v.toFixed(3)).join(','),
      );
    expect(normals.size).toBeGreaterThan(100);
  });
  it('joins roof sections at identical heights and shares smooth normals across them', () => {
    const vertices = createParkingMesh('stands', true).glass;
    expect(vertices.length).toBeGreaterThan(0);
    for (let i = 0; i < vertices.length - 60; i += 60) {
      // Right edge of one quad equals the left edge of its neighbour.
      expect([...vertices.slice(i + 10, i + 16)]).toEqual([
        ...vertices.slice(i + 60, i + 66),
      ]);
    }
    const heights = Array.from(
      { length: vertices.length / 10 },
      (_, i) => vertices[i * 10 + 2],
    );
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.45);
    expect(Math.min(...heights)).toBeGreaterThan(2);
    expect(vertices[9]).toBeLessThan(0.4);
  });
  it('shows glazing only for explicitly covered open fixtures', () => {
    expect(createParkingMesh('stands', false).glass).toHaveLength(0);
    expect(createParkingMesh('lockers', true).glass).toHaveLength(0);
    expect(createParkingMesh('shed', true).glass).toHaveLength(0);
    expect(buildParkingModels([point('stands', null)])[0].covered).toBe(false);
    expect(buildParkingModels([point('stands', 'no')])[0].covered).toBe(false);
    expect(buildParkingModels([point('stands', 'yes')])[0].covered).toBe(true);
  });
  it('retains unknown types and cycling POIs as pins and marks only the selected model', () => {
    expect(
      buildParkingModels([
        point(null),
        point('other'),
        { ...point('stands'), ...{ categories: ['water'] } },
      ]),
    ).toHaveLength(0);
    const models = buildParkingModels(
      [point('stands'), { ...point('rack'), id: 'second' }],
      'test',
    );
    expect(models.find((model) => model.point.id === 'test')?.selected).toBe(
      true,
    );
    expect(models.find((model) => model.point.id === 'second')?.selected).toBe(
      false,
    );
  });
});

describe('nearby model groups', () => {
  const waverley = [
    ['cec:143', 55.9526307326375, -3.18713137747795],
    ['osm:node:13043142711', 55.9524831, -3.1872329],
    ['osm:node:13043142710', 55.9524713, -3.1871292],
    ['cec:876', 55.9523611042283, -3.1871391394162],
  ].map(([id, latitude, longitude]) => ({
    ...point('stands', 'yes'),
    id: String(id),
    latitude: Number(latitude),
    longitude: Number(longitude),
  }));
  it('shares one model for Waverley 4, 6 and 7 while keeping the farther site separate', () => {
    const models = buildParkingModels(waverley, waverley[1].id);
    expect(models).toHaveLength(2);
    expect(models[0].members.map((point) => point.id).sort()).toEqual(
      waverley
        .slice(0, 3)
        .map((point) => point.id)
        .sort(),
    );
    expect(models[0].point.id).toBe(waverley[1].id);
    expect(models[0].selected).toBe(true);
    expect(models[1].members).toEqual([waverley[3]]);
    expect(buildParkingModels([...waverley].reverse(), waverley[1].id)).toEqual(
      models,
    );
  });
  it('preserves type and cover differences even at identical coordinates', () => {
    expect(
      buildParkingModels([
        { ...point('stands', 'yes'), id: 'a' },
        { ...point('stands', 'no'), id: 'b' },
        { ...point('rack', 'yes'), id: 'c' },
      ]),
    ).toHaveLength(3);
  });
  it('spaces every button by more than its touch target, including larger groups', () => {
    const offsets = Array.from({ length: 11 }, (_, i) =>
      parkingModelButtonOffset(i, 11),
    );
    for (let i = 0; i < offsets.length; i++) {
      for (let j = i + 1; j < offsets.length; j++) {
        expect(
          Math.hypot(
            offsets[i][0] - offsets[j][0],
            offsets[i][1] - offsets[j][1],
          ),
        ).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

describe('dataset type aliases', () => {
  it.each(parkingModelCatalog)(
    'maps every explicit alias for $kind regardless of case, spaces or hyphens',
    ({ kind, aliases }) => {
      for (const alias of aliases) {
        expect(resolveParkingModelType(alias)).toBe(kind);
        expect(
          resolveParkingModelType(
            `  ${alias.toUpperCase().replaceAll('_', ' ')}  `,
          ),
        ).toBe(kind);
      }
    },
  );
  it('does not invent hardware from access, capacity, unknown or mixed-type tags', () => {
    for (const value of [
      null,
      '',
      ' ',
      'yes',
      'privee',
      'Staff Only',
      'informal',
      'high_capacity',
      'high_density',
      'other',
      'unknown_stand_type',
      'stands;lockers',
      'stands;two-tier',
    ]) {
      expect(resolveParkingModelType(value)).toBeNull();
    }
    expect(resolveParkingModelType('stand; sheffield_stands')).toBe('stands');
  });
  it('distinguishes post hoops, bollards, wheel loops, anchors and streetpods', () => {
    const kinds = [
      'post_hoop',
      'bollard',
      'wall_loops',
      'anchors',
      'streetpod',
    ].map(resolveParkingModelType);
    expect(new Set(kinds).size).toBe(5);
    const meshes = parkingModelCatalog.map(({ kind }) =>
      [...createParkingMesh(kind, false).opaque].join(','),
    );
    expect(new Set(meshes).size).toBe(parkingModelCatalog.length);
  });
  it('keeps alias groups together and distinct physical shapes apart', () => {
    const models = buildParkingModels(
      ['post_hoop', 'cyclehoop', 'hoop'].map((type, i) => ({
        ...point(type),
        id: String(i),
      })),
    );
    expect(models.map((model) => [model.kind, model.members.length])).toEqual([
      ['post-hoop', 2],
      ['stands', 1],
    ]);
  });
  it('recognizes explicit cover aliases without inferring cover from unknown values', () => {
    expect(parkingModelHasCover('covered_staple', null)).toBe(true);
    expect(parkingModelHasCover('covered_staple', 'no')).toBe(false);
    expect(parkingModelHasCover('stands', ' Yes ')).toBe(true);
    expect(parkingModelHasCover('stands', 'unknown')).toBe(false);
    expect(createParkingMesh('shelter', false).glass.length).toBeGreaterThan(0);
  });
});

describe('teal model selection', () => {
  it('preserves metal and glazing with a teal outline and faint ground fill for every model family', () => {
    const accent = new Float32Array([20 / 255, 184 / 255, 166 / 255]);
    const steel = new Float32Array([0.62, 0.71, 0.73]);
    const matchingVertices = (vertices: Float32Array, color: Float32Array) => {
      const matches: number[] = [];
      for (let i = 0; i < vertices.length; i += 10) {
        if (color.every((channel, j) => vertices[i + 6 + j] === channel))
          matches.push(i);
      }
      return matches;
    };
    for (const { kind } of parkingModelCatalog) {
      const normal = createParkingMesh(kind, true);
      const selected = createParkingMesh(kind, true, true);
      expect(selected.glass).toEqual(normal.glass);
      // The base becomes a faint teal fill, with no extra transparent surface.
      expect(selected.opaque[6]).toBeLessThan(normal.opaque[6]);
      expect(selected.opaque[7]).toBeGreaterThan(normal.opaque[7]);
      expect(selected.opaque[8]).toBeGreaterThan(normal.opaque[8]);
      expect(selected.opaque[9]).toBe(1);
      expect(matchingVertices(selected.opaque, steel).length).toBe(
        matchingVertices(normal.opaque, steel).length,
      );
      const outline = matchingVertices(selected.opaque, accent).filter(
        (i) =>
          selected.opaque[i + 2] >= 0.029 &&
          selected.opaque[i + 2] <= 0.111 &&
          (Math.abs(selected.opaque[i]) > 1.5 ||
            Math.abs(selected.opaque[i + 1]) > 1.25),
      );
      expect(outline.length, kind).toBeGreaterThan(100);
      expect(selected.opaque.length, kind).toBeGreaterThan(
        normal.opaque.length,
      );
    }
  });
});
