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

export const parkingModelsLayer = 'parking-models-3d';
const layers = new WeakMap<Map, ParkingLayer>();
type GpuMesh = { mesh: ParkingMesh; opaque: WebGLBuffer; glass: WebGLBuffer };
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
  renderedCount = 0;
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
  onAdd(map: Map, gl: WebGL2RenderingContext) {
    this.map = map;
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
    if (this.map.getZoom() < parkingModelsZoom || !this.models.length) return;
    // Context restoration invalidates every GPU handle even when the style survives.
    if (!this.program || !gl.isProgram(this.program)) this.initialize(gl);
    const width = this.map.getCanvas().clientWidth,
      height = this.map.getCanvas().clientHeight;
    for (const model of this.models) {
      const lngLat: [number, number] = [model.longitude, model.latitude];
      const origin = MercatorCoordinate.fromLngLat(
        lngLat,
        this.map.queryTerrainElevation(lngLat) ?? 0,
      );
      const matrix = modelMatrix(
        args.defaultProjectionData.mainMatrix,
        origin,
        origin.meterInMercatorCoordinateUnits() * parkingModelScale,
      );
      const center = project(matrix, 0, 0, 1, width, height);
      if (
        center.w <= 0 ||
        center.x < -300 ||
        center.y < -300 ||
        center.x > width + 300 ||
        center.y > height + 300
      )
        continue;
      const corners = [-1.85, 1.85].flatMap((x) =>
        [-1.55, 1.55].flatMap((y) =>
          [0, 2.65].map((z) => project(matrix, x, y, z, width, height)),
        ),
      );
      this.placed.push({
        model,
        gpu: this.gpu(gl, model),
        matrix,
        depth: center.z,
        bounds: {
          left: Math.min(...corners.map((p) => p.x)),
          right: Math.max(...corners.map((p) => p.x)),
          top: Math.min(...corners.map((p) => p.y)),
          bottom: Math.max(...corners.map((p) => p.y)),
        },
      });
    }
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
) {
  let layer = layers.get(map);
  if (!map.getLayer(parkingModelsLayer)) {
    layer = new ParkingLayer();
    layers.set(map, layer);
    map.addLayer(layer);
  }
  layer!.models = models;
  layer!.satelliteContrast = satelliteContrast;
  map.triggerRepaint();
}
export const getParkingModelRenderCount = (map: Map) =>
  layers.get(map)?.renderedCount ?? 0;
export const getParkingModelBadgeOffset = (map: Map, pointId: string) =>
  layers.get(map)?.destinationBadgeOffset(pointId) ?? null;
export const pickParkingModel = (map: Map, point: { x: number; y: number }) =>
  layers.get(map)?.pick(point) ?? null;
