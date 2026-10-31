import { describe, expect, it, vi } from 'vitest';
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as LibreMap,
} from 'maplibre-gl';
import { syncParkingModels } from './parking-model-layer';
import { buildParkingModels } from './parking-models';

function setup() {
  const listeners = new Map<string, Set<() => void>>();
  let layer: CustomLayerInterface | undefined;
  const gl = {
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getUniformLocation: vi.fn((program, name) => ({ program, name })),
    createVertexArray: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    isProgram: vi.fn(() => true),
    useProgram: vi.fn(),
    bindVertexArray: vi.fn(),
    uniform2f: vi.fn(),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform3f: vi.fn(),
    uniformMatrix4fv: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    depthFunc: vi.fn(),
    blendFunc: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    drawArrays: vi.fn(),
    depthMask: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteVertexArray: vi.fn(),
    deleteProgram: vi.fn(),
    drawingBufferWidth: 800,
    drawingBufferHeight: 600,
  };
  const context = gl as unknown as WebGL2RenderingContext;
  const map = {
    on(event: string, listener: () => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    off(event: string, listener: () => void) {
      listeners.get(event)?.delete(listener);
    },
    getLayer: () => layer,
    addLayer(value: CustomLayerInterface) {
      layer = value;
      layer.onAdd!(map as unknown as LibreMap, context);
    },
    getZoom: () => 18,
    getPitch: () => 0,
    getBearing: () => 0,
    getCenter: () => ({ lng: -3.19, lat: 55.95 }),
    getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
    queryTerrainElevation: () => 0,
    isMoving: () => false,
    triggerRepaint: vi.fn(),
  };
  const models = buildParkingModels([
    {
      id: 'test',
      name: 'Test parking',
      latitude: 55.95,
      longitude: -3.19,
      sourceId: 'osm',
      properties: { bicycle_pa: 'stands', covered: 'yes' },
    },
  ]);
  syncParkingModels(map as unknown as LibreMap, models);
  const args = {
    defaultProjectionData: {
      mainMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    },
  } as unknown as CustomRenderMethodInput;
  return {
    gl,
    repaint: map.triggerRepaint,
    render: () => layer!.render!(context, args),
    restore: () => {
      for (const listener of listeners.get('webglcontextrestored') ?? [])
        listener();
    },
    remove: () => layer!.onRemove!(map as unknown as LibreMap, context),
  };
}

describe('parking model GPU lifecycle', () => {
  it('reuses program, uniform locations and mesh buffers across frames', () => {
    const { gl, render } = setup();
    render();
    expect(gl.drawArrays).toHaveBeenCalled();
    const lookups = gl.getUniformLocation.mock.calls.length;
    const uploads = gl.bufferData.mock.calls.length;
    expect(lookups).toBeGreaterThan(0);
    expect(uploads).toBeGreaterThan(0);
    render();
    render();
    expect(gl.isProgram).not.toHaveBeenCalled();
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    expect(gl.getUniformLocation).toHaveBeenCalledTimes(lookups);
    expect(gl.bufferData).toHaveBeenCalledTimes(uploads);
  });

  it('recreates handles after context restoration when the layer survives', () => {
    const { gl, render, restore, remove, repaint } = setup();
    render();
    const oldProgram = gl.createProgram.mock.results[0].value;
    const oldBuffers = gl.createBuffer.mock.results.map(({ value }) => value);
    const lookups = gl.getUniformLocation.mock.calls.length;
    const uploads = gl.bufferData.mock.calls.length;
    restore();
    render();
    const newProgram = gl.createProgram.mock.results[1].value;
    expect(newProgram).not.toBe(oldProgram);
    expect(gl.getUniformLocation).toHaveBeenCalledTimes(lookups * 2);
    expect(gl.bufferData).toHaveBeenCalledTimes(uploads * 2);
    expect(gl.useProgram).toHaveBeenLastCalledWith(newProgram);
    expect(gl.uniformMatrix4fv.mock.lastCall?.[0].program).toBe(newProgram);
    expect(gl.uniformMatrix4fv.mock.lastCall?.[0].name).toBe('u_matrix');
    render();
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    expect(gl.isProgram).not.toHaveBeenCalled();
    remove();
    expect(gl.deleteProgram).toHaveBeenCalledWith(newProgram);
    for (const buffer of oldBuffers)
      expect(
        gl.deleteBuffer.mock.calls.some(([value]) => value === buffer),
      ).toBe(false);
    // Removal detaches the listener; future restoration does not wake this layer.
    repaint.mockClear();
    restore();
    expect(repaint).not.toHaveBeenCalled();
  });
});
