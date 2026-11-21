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
import { parkingVertexStride as stride } from './parking-model-mesh';
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
  it.each(parkingModelCatalog)(
    'keeps $kind contact shading independent from fixture surfaces',
    ({ kind }) => {
      const model = createParkingMesh(kind, false);
      if (kind === 'floor') {
        expect(model.shadow.length).toBe(0);
        return;
      }
      expect(model.shadow.length).toBeGreaterThan(0);
      expect(model.shadow.length % (stride * 6)).toBe(0);
      for (let i = 0; i < model.shadow.length; i += stride) {
        expect(model.shadow[i + 2]).toBeCloseTo(0.017);
        expect(model.shadow[i + 10]).toBe(6);
      }
      expect(createParkingMesh(kind, false, true, true).shadow).toEqual(
        model.shadow,
      );
    },
  );
  it.each(parkingModelCatalog.filter(({ kind }) => kind !== 'floor'))(
    'grounds $kind on its own structure',
    ({ kind }) => {
      const data = createParkingMesh(kind, false).opaque;
      // No fixture sits on the old uniform platform that sliced across slopes.
      for (let i = 0; i < data.length; i += stride * 3) {
        const j = i + stride;
        const k = j + stride;
        if (Math.max(data[i + 2], data[j + 2], data[k + 2]) >= 0.027) continue;
        const area =
          Math.abs(
            (data[j] - data[i]) * (data[k + 1] - data[i + 1]) -
              (data[k] - data[i]) * (data[j + 1] - data[i + 1]),
          ) / 2;
        expect(area).toBeLessThan(4);
      }
    },
  );
  it('keeps bolted flanges and a straight top on each Sheffield stand', () => {
    const data = createParkingMesh('stands', false).opaque;
    const vertices = Array.from({ length: data.length / stride }, (_, index) =>
      data.subarray(index * stride, (index + 1) * stride),
    );
    for (const y of [-0.9, 0, 0.9])
      for (const x of [-0.57, 0.57]) {
        const flange = vertices.filter(
          ([px, py, z]) =>
            Math.abs(px - x) < 0.11 && Math.abs(py - y) < 0.11 && z < 0.047,
        );
        expect(flange.length).toBeGreaterThan(100);
        expect(Math.min(...flange.map((vertex) => vertex[2]))).toBeCloseTo(
          0.012,
        );
      }
    for (const x of [-0.3796, 0.3796]) {
      expect(
        vertices.some(
          ([px, py, z]) =>
            Math.abs(px - x) < 0.012 && Math.abs(py) < 0.01 && z > 1.16,
        ),
      ).toBe(true);
    }
  });
  it('fits the redesigned stand and canopy within their geometry budgets', () => {
    const stand = createParkingMesh('stands', false);
    const shelter = createParkingMesh('stands', true);
    const triangles = (surface: Float32Array) => surface.length / (stride * 3);
    expect(triangles(stand.opaque)).toBeLessThan(1800);
    expect(triangles(shelter.opaque) + triangles(shelter.glass)).toBeLessThan(
      3500,
    );
  });
  it.each(parkingModelCatalog.map(({ kind }) => kind))(
    'builds finite triangles with unit normals for %s',
    (kind) => {
      const mesh = createParkingMesh(kind, true);
      for (const vertices of [mesh.opaque, mesh.glass]) {
        expect(vertices.length % (stride * 3)).toBe(0);
        for (let i = 0; i < vertices.length; i += stride) {
          expect(
            [...vertices.slice(i, i + stride)].every(Number.isFinite),
          ).toBe(true);
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
    for (let i = 0; i < vertices.length; i += stride)
      normals.add(
        [...vertices.slice(i + 3, i + 6)].map((v) => v.toFixed(3)).join(','),
      );
    expect(normals.size).toBeGreaterThan(100);
  });
  it('joins roof sections at identical heights and shares smooth normals across them', () => {
    const vertices = createParkingMesh('stands', true).glass;
    expect(vertices.length).toBeGreaterThan(0);
    for (let i = 0; i < vertices.length - stride * 6; i += stride * 6) {
      // Right edge of one quad equals the left edge of its neighbour.
      expect([...vertices.slice(i + stride, i + stride + 6)]).toEqual([
        ...vertices.slice(i + stride * 6, i + stride * 6 + 6),
      ]);
    }
    const heights = Array.from(
      { length: vertices.length / stride },
      (_, i) => vertices[i * stride + 2],
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

describe('individual nearby models', () => {
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
  it('retains one model per Waverley site with original coordinates and stable identity', () => {
    const models = buildParkingModels(waverley, waverley[1].id);
    expect(models).toHaveLength(4);
    for (const model of models) {
      const original = waverley.find((point) => point.id === model.point.id)!;
      expect(model.members).toEqual([original]);
      expect(model.longitude).toBe(original.longitude);
      expect(model.latitude).toBe(original.latitude);
      expect(model.selected).toBe(original.id === waverley[1].id);
    }
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
  it('resolves aliases consistently without combining separate records', () => {
    const models = buildParkingModels(
      ['post_hoop', 'cyclehoop', 'hoop'].map((type, i) => ({
        ...point(type),
        id: String(i),
      })),
    );
    expect(models.map((model) => [model.kind, model.members.length])).toEqual([
      ['post-hoop', 1],
      ['post-hoop', 1],
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
  it('preserves metal and glazing with a teal outline', () => {
    const accent = new Float32Array([20 / 255, 184 / 255, 166 / 255]);
    const steel = new Float32Array([0.62, 0.71, 0.73]);
    const matchingVertices = (vertices: Float32Array, color: Float32Array) => {
      const matches: number[] = [];
      for (let i = 0; i < vertices.length; i += stride) {
        if (color.every((channel, j) => vertices[i + 6 + j] === channel))
          matches.push(i);
      }
      return matches;
    };
    for (const { kind } of parkingModelCatalog) {
      const normal = createParkingMesh(kind, true);
      const selected = createParkingMesh(kind, true, true);
      expect(selected.glass).toEqual(normal.glass);
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
