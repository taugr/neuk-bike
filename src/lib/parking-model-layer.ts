import {
  parkingVertexShader,
  parkingFragmentShader,
} from './parking-model-shaders';
import {
  MercatorCoordinate,
  type Map,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
} from 'maplibre-gl';
import {
  createParkingMesh,
  parkingModelScale,
  parkingModelsZoom,
  type ParkingMesh,
  type ParkingModel,
} from './parking-models';

import {
  placeParkingModels,
  offsetModelLocation,
  placeModelButtons,
  type ModelBounds,
  type ModelOffset,
  type ModelPlacement,
} from './parking-model-placement';

export type ParkingModelDisplay = {
  longitude: number;
  latitude: number;
  ground: { x: number; y: number };
  anchor: { x: number; y: number };
  bounds: ModelBounds;
  offset: ModelOffset;
  buttonOffset: [number, number];
  groupId: string;
  members: string[];
  neutral: boolean;
};

export const parkingModelsLayer = 'parking-models-3d';
const layers = new WeakMap<Map, ParkingLayer>();
type MeshBounds = { min: number[]; max: number[] };
type GpuMesh = {
  mesh: ParkingMesh;
  opaque: WebGLBuffer;
  glass: WebGLBuffer;
};
function meshBounds(mesh: ParkingMesh): MeshBounds {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const data of [mesh.opaque, mesh.glass])
    for (let i = 0; i < data.length; i += stride)
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], data[i + axis]);
        max[axis] = Math.max(max[axis], data[i + axis]);
      }
  return { min, max };
}
type PlacedMesh = {
  model: ParkingModel;
  gpu: GpuMesh;
  matrix: Float32Array;
  depth: number;
  bounds: { left: number; right: number; top: number; bottom: number };
};
const stride = 10;

/** Multiply in double precision before handing the local transform to WebGL.
 * Uploading global Mercator positions as floats makes thin tubes jitter. */
export function modelMatrix(
  matrix: ArrayLike<number>,
  origin: { x: number; y: number; z: number },
  scale: number,
) {
  const result = new Float32Array(16);
  for (let row = 0; row < 4; row++) {
    result[row] = matrix[row] * scale;
    result[4 + row] = -matrix[4 + row] * scale;
    result[8 + row] = matrix[8 + row] * scale;
    result[12 + row] =
      matrix[row] * origin.x +
      matrix[4 + row] * origin.y +
      matrix[8 + row] * origin.z +
      matrix[12 + row];
  }
  return result;
}
function project(
  matrix: Float32Array,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
) {
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  return {
    x:
      (((matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w + 1) *
        width) /
      2,
    y:
      ((1 - (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w) *
        height) /
      2,
    z: (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / w,
    w,
  };
}
class ParkingLayer implements CustomLayerInterface {
  id = parkingModelsLayer;
  type = 'custom' as const;
  renderingMode = '3d' as const;
  models: ParkingModel[] = [];
  satelliteContrast = false;
  getVisibleArea?: () => ModelBounds;
  renderedCount = 0;
  display = new globalThis.Map<string, ParkingModelDisplay>();
  private layout: ModelPlacement[] = [];
  private layoutKey = '';
  private buttonOffsets = new globalThis.Map<string, [number, number]>();
  private geometryBounds = new globalThis.Map<string, MeshBounds>();
  destinationBadgeOffset(pointId: string) {
    const placed = this.placed.find(({ model }) => model.point.id === pointId);
    if (!placed) return null;
    const ground = project(
      placed.matrix,
      0,
      0,
      0,
      this.map.getCanvas().clientWidth,
      this.map.getCanvas().clientHeight,
    );
    return placed.bounds.top - ground.y - 12;
  }
  private map!: Map;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private buffers = new globalThis.Map<string, GpuMesh>();
  private placed: PlacedMesh[] = [];
  private onCameraSettled = () => this.map.triggerRepaint();
  onAdd(map: Map, gl: WebGL2RenderingContext) {
    this.map = map;
    map.on('moveend', this.onCameraSettled);
    map.on('resize', this.onCameraSettled);
    this.initialize(gl);
  }
  private initialize(gl: WebGL2RenderingContext) {
    this.buffers.clear();
    const shader = (type: number, source: string) => {
      const value = gl.createShader(type)!;
      gl.shaderSource(value, source);
      gl.compileShader(value);
      if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(value);
        gl.deleteShader(value);
        throw new Error(`Parking shader: ${error}`);
      }
      return value;
    };
    const vertex = shader(gl.VERTEX_SHADER, parkingVertexShader);
    const fragment = shader(gl.FRAGMENT_SHADER, parkingFragmentShader);
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw new Error('Parking shader could not link');
    this.vao = gl.createVertexArray();
  }
  private gpu(gl: WebGL2RenderingContext, model: ParkingModel) {
    const key = `${model.kind}:${model.covered}:${model.selected}:${this.satelliteContrast}`;
    const existing = this.buffers.get(key);
    if (existing) return existing;
    const mesh = createParkingMesh(
      model.kind,
      model.covered,
      model.selected,
      this.satelliteContrast,
    );
    const upload = (data: Float32Array) => {
      const buffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return buffer;
    };
    const value = {
      mesh,
      opaque: upload(mesh.opaque),
      glass: upload(mesh.glass),
    };
    this.buffers.set(key, value);
    return value;
  }
  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
    this.renderedCount = 0;
    this.placed = [];
    if (this.map.getZoom() < parkingModelsZoom || !this.models.length) {
      this.display.clear();
      this.layout = [];
      this.layoutKey = '';
      return;
    }
    // Context restoration invalidates every GPU handle even when the style survives.
    if (!this.program || !gl.isProgram(this.program)) this.initialize(gl);
    const width = this.map.getCanvas().clientWidth,
      height = this.map.getCanvas().clientHeight;
    const modelById = new globalThis.Map(
      this.models.map((model) => [model.point.id, model]),
    );
    const positions = new globalThis.Map<
      string,
      ReturnType<typeof projectModel>
    >();
    const projectModel = (model: ParkingModel, offset: ModelOffset) => {
      const position = offsetModelLocation(
        model.point.longitude,
        model.point.latitude,
        offset,
      );
      const lngLat: [number, number] = [position.longitude, position.latitude];
      const origin = MercatorCoordinate.fromLngLat(
        lngLat,
        this.map.queryTerrainElevation(lngLat) ?? 0,
      );
      const matrix = modelMatrix(
        args.defaultProjectionData.mainMatrix,
        origin,
        origin.meterInMercatorCoordinateUnits() * parkingModelScale,
      );
      const key = `${model.kind}:${model.covered}`;
      // Always reserve the selected outline too, so selection never moves neighbours.
      let extent = this.geometryBounds.get(key);
      if (!extent) {
        extent = meshBounds(createParkingMesh(model.kind, model.covered, true));
        this.geometryBounds.set(key, extent);
      }
      const corners = [extent.min[0], extent.max[0]].flatMap((x) =>
        [extent.min[1], extent.max[1]].flatMap((y) =>
          [extent.min[2], extent.max[2]].map((z) =>
            project(matrix, x, y, z, width, height),
          ),
        ),
      );
      const ground = project(matrix, 0, 0, 0, width, height);
      // Reserve the satellite silhouette in both styles to avoid style-driven shuffling.
      const padding = 2;
      const bounds = {
        left: Math.min(...corners.map((p) => p.x)) - padding,
        right: Math.max(...corners.map((p) => p.x)) + padding,
        top: Math.min(...corners.map((p) => p.y)) - padding,
        bottom: Math.max(...corners.map((p) => p.y)) + padding,
      };
      return { ...position, ground, bounds, matrix };
    };
    const projection = (id: string, offset: ModelOffset) => {
      const key = `${id}:${offset.east}:${offset.north}`;
      let value = positions.get(key);
      if (!value) {
        value = projectModel(modelById.get(id)!, offset);
        positions.set(key, value);
      }
      return value;
    };
    const zero = { east: 0, north: 0 };
    const ids = this.models
      .filter((model) => {
        const { ground, bounds } = projection(model.point.id, zero);
        return (
          ground.w > 0 &&
          Object.values(bounds).every(Number.isFinite) &&
          ground.x >= -100 &&
          ground.y >= -100 &&
          ground.x <= width + 100 &&
          ground.y <= height + 100
        );
      })
      .map((model) => model.point.id);
    const area = this.getVisibleArea?.() ?? {
      left: 0,
      right: width,
      top: 0,
      bottom: height,
    };
    const center = this.map.getCenter();
    const key = JSON.stringify([
      width,
      height,
      area.left,
      area.right,
      area.top,
      area.bottom,
      center.lng,
      center.lat,
      this.map.getZoom(),
      this.map.getPitch(),
      this.map.getBearing(),
      ids.map((id) => {
        const m = modelById.get(id)!;
        return [id, m.point.longitude, m.point.latitude, m.kind, m.covered];
      }),
    ]);
    const needsLayout =
      key !== this.layoutKey && (!this.map.isMoving() || !this.layout.length);
    if (needsLayout) {
      const previous = new globalThis.Map(
        this.layout
          .filter((p) => p.members.length === 1)
          .map((p) => [p.id, p.offset]),
      );
      this.layout = placeParkingModels({
        ids,
        previous,
        project: (id, offset) => projection(id, offset).bounds,
      });
      this.layoutKey = key;
      this.buttonOffsets.clear();
    }
    this.display.clear();
    for (const placement of this.layout) {
      const members = placement.members.filter((id) => modelById.has(id));
      if (!members.length) continue;
      const model = modelById.get(members[0])!;
      const position = projection(model.point.id, placement.offset);
      const neutral = members.some((id) => {
        const other = modelById.get(id)!;
        return other.kind !== model.kind || other.covered !== model.covered;
      });
      if (!neutral) {
        const selected = members.some((id) => modelById.get(id)!.selected);
        const rendered = { ...model, selected };
        this.placed.push({
          model: rendered,
          gpu: this.gpu(gl, rendered),
          matrix: position.matrix,
          depth: position.ground.z,
          bounds: position.bounds,
        });
      }
      for (const [index, id] of members.entries()) {
        const anchor = projection(id, zero).ground;
        const preferredY = neutral
          ? 26
          : position.bounds.bottom - position.ground.y + 26;
        const columns = Math.min(4, members.length);
        const rowCount = Math.min(
          columns,
          members.length - Math.floor(index / columns) * columns,
        );
        const buttonOffset: [number, number] = [
          ((index % columns) - (rowCount - 1) / 2) * 46,
          preferredY + Math.floor(index / columns) * 46,
        ];
        this.display.set(id, {
          ...position,
          anchor,
          offset: placement.offset,
          buttonOffset,
          groupId: members[0],
          members,
          neutral,
        });
      }
    }
    if (
      needsLayout ||
      [...this.display.keys()].some((id) => !this.buttonOffsets.has(id))
    ) {
      this.buttonOffsets = placeModelButtons(
        [...this.display].map(([id, value]) => ({
          id,
          ground: value.ground,
          preferred: value.buttonOffset,
        })),
        this.placed.map((p) => p.bounds),
        area,
      );
    }
    for (const [id, value] of this.display)
      value.buttonOffset = this.buttonOffsets.get(id) ?? value.buttonOffset;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(
      gl.getUniformLocation(this.program!, 'u_viewport'),
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
    );
    gl.uniform1i(
      gl.getUniformLocation(this.program!, 'u_satellite'),
      Number(this.satelliteContrast),
    );
    const expandLocation = gl.getUniformLocation(this.program!, 'u_expand');
    const outlineLocation = gl.getUniformLocation(this.program!, 'u_outline');
    const pixelRatio = gl.drawingBufferWidth / Math.max(1, width);
    // Give subpixel tubes a little more body at the first model zooms.
    const expansion = this.satelliteContrast
      ? Math.max(0, 19 - this.map.getZoom()) * 0.3 * pixelRatio
      : 0;
    // Preserve MapLibre's depth range, which reserves space for map layers.
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const bearing = (this.map.getBearing() * Math.PI) / 180,
      pitch = (this.map.getPitch() * Math.PI) / 180;
    gl.uniform3f(
      gl.getUniformLocation(this.program!, 'u_view'),
      Math.sin(bearing) * Math.sin(pitch),
      -Math.cos(bearing) * Math.sin(pitch),
      Math.cos(pitch),
    );
    const matrixLocation = gl.getUniformLocation(this.program!, 'u_matrix');
    const draw = (placed: PlacedMesh, glass: boolean) => {
      const data = glass ? placed.gpu.mesh.glass : placed.gpu.mesh.opaque;
      if (!data.length) return;
      gl.uniformMatrix4fv(matrixLocation, false, placed.matrix);
      gl.bindBuffer(
        gl.ARRAY_BUFFER,
        glass ? placed.gpu.glass : placed.gpu.opaque,
      );
      for (const [index, size, offset] of [
        [0, 3, 0],
        [1, 3, 3],
        [2, 4, 6],
      ]) {
        gl.enableVertexAttribArray(index);
        gl.vertexAttribPointer(
          index,
          size,
          gl.FLOAT,
          false,
          stride * 4,
          offset * 4,
        );
      }
      gl.drawArrays(gl.TRIANGLES, 0, data.length / stride);
    };
    if (this.satelliteContrast) {
      // Paint the narrow silhouette first without writing depth, so the real
      // surfaces cover its interior. Glazing keeps its open, transparent shape.
      gl.depthMask(false);
      gl.uniform1i(outlineLocation, 1);
      gl.uniform1f(expandLocation, expansion + 1.1 * pixelRatio);
      for (const placed of this.placed) draw(placed, false);
    }
    gl.uniform1i(outlineLocation, 0);
    gl.uniform1f(expandLocation, expansion);
    gl.depthMask(true);
    for (const placed of this.placed) draw(placed, false);
    gl.uniform1f(expandLocation, 0);
    gl.depthMask(false);
    // Render glazing after all opaque fixtures, far to near, without hiding
    // stands behind a transparent surface in the shared depth buffer.
    for (const placed of [...this.placed].sort((a, b) => b.depth - a.depth))
      draw(placed, true);
    gl.depthMask(true);
    gl.bindVertexArray(null);
    this.renderedCount = this.placed.length;
  }
  pick(point: { x: number; y: number }): string | null {
    let closest = Infinity,
      result: string | null = null;
    const width = this.map.getCanvas().clientWidth,
      height = this.map.getCanvas().clientHeight;
    for (const placed of this.placed) {
      if (
        point.x < placed.bounds.left ||
        point.x > placed.bounds.right ||
        point.y < placed.bounds.top ||
        point.y > placed.bounds.bottom
      )
        continue;
      for (const data of [placed.gpu.mesh.opaque, placed.gpu.mesh.glass]) {
        for (let i = 0; i < data.length; i += stride * 3) {
          const p = [0, 1, 2].map((j) =>
            project(
              placed.matrix,
              data[i + j * stride],
              data[i + j * stride + 1],
              data[i + j * stride + 2],
              width,
              height,
            ),
          );
          if (p.some((v) => v.w <= 0)) continue;
          if (
            point.x < Math.min(...p.map((v) => v.x)) ||
            point.x > Math.max(...p.map((v) => v.x)) ||
            point.y < Math.min(...p.map((v) => v.y)) ||
            point.y > Math.max(...p.map((v) => v.y))
          )
            continue;
          const [a, b, c] = p;
          const denominator =
            (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
          if (Math.abs(denominator) < 1e-8) continue;
          const u =
            ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) /
            denominator;
          const v =
            ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) /
            denominator;
          if (u < 0 || v < 0 || u + v > 1) continue;
          const depth = u * a.z + v * b.z + (1 - u - v) * c.z;
          if (depth < closest) {
            closest = depth;
            result = placed.model.point.id;
          }
        }
      }
    }
    return result;
  }
  onRemove(_map: Map, gl: WebGL2RenderingContext) {
    this.map.off('moveend', this.onCameraSettled);
    this.map.off('resize', this.onCameraSettled);
    for (const value of this.buffers.values()) {
      gl.deleteBuffer(value.opaque);
      gl.deleteBuffer(value.glass);
    }
    this.buffers.clear();
    this.placed = [];
    this.renderedCount = 0;
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
    this.vao = null;
    this.program = null;
  }
}
export function syncParkingModels(
  map: Map,
  models: ParkingModel[],
  satelliteContrast = false,
  getVisibleArea?: () => ModelBounds,
) {
  let layer = layers.get(map);
  if (!map.getLayer(parkingModelsLayer)) {
    layer = new ParkingLayer();
    layers.set(map, layer);
    map.addLayer(layer);
  }
  layer!.models = models;
  layer!.getVisibleArea = getVisibleArea;
  layer!.satelliteContrast = satelliteContrast;
  map.triggerRepaint();
}
export const getParkingModelRenderCount = (map: Map) =>
  layers.get(map)?.renderedCount ?? 0;
export const getParkingModelBadgeOffset = (map: Map, pointId: string) =>
  layers.get(map)?.destinationBadgeOffset(pointId) ?? null;
export const pickParkingModel = (map: Map, point: { x: number; y: number }) =>
  layers.get(map)?.pick(point) ?? null;

export const getParkingModelDisplay = (map: Map, pointId: string) =>
  layers.get(map)?.display.get(pointId);
