import {
  materialRoofStride,
  roofTileExtent,
  wallOriginTile,
} from './map-aerial-roof-geometry';
import { roofOutlineStride, wallVertexStride } from './map-aerial-walls';

export const edinburghMeshZoom = 16;
export const edinburghMeshVersion = 4;
const signature = 0x3455454e;
const bytePlaneSignature = 0x4255454e;
const headerBytes = 36;
const compactIndexCapacity = 65536;

type MeshData<T> = {
  roofs: T;
  walls: T;
  outlines: T;
  buildings: number;
  surveyed: number;
};

export type EdinburghMeshSection = {
  vertices: Float32Array<ArrayBuffer>;
  indices: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>;
};

export type EdinburghMesh = MeshData<EdinburghMeshSection>;

export function edinburghMeshBytes(mesh: EdinburghMesh) {
  return [mesh.roofs, mesh.walls, mesh.outlines].reduce(
    (bytes, { vertices, indices }) =>
      bytes + vertices.byteLength + indices.byteLength,
    0,
  );
}

function meshComponents(x: number, y: number, zoom: number) {
  const scale = 2 ** (wallOriginTile.z - zoom);
  const offsetX = ((x + 0.5) * scale - wallOriginTile.x) * roofTileExtent;
  const offsetY = ((y + 0.5) * scale - wallOriginTile.y) * roofTileExtent;
  const position = [offsetX, offsetY, 0];
  const horizontalScale = zoom < 14 ? 0.125 : 0.25;
  return [
    {
      name: 'roofs',
      stride: materialRoofStride,
      offsets: position,
      scales: [
        horizontalScale,
        horizontalScale,
        10,
        1024,
        1024,
        128,
        1,
        4096,
        4096,
        4096,
        4096,
      ],
    },
    {
      name: 'walls',
      stride: wallVertexStride,
      offsets: position,
      scales: [
        horizontalScale,
        horizontalScale,
        10,
        16,
        16,
        1024,
        1,
        16,
        1,
        1,
        12,
        12,
      ],
    },
    {
      name: 'outlines',
      stride: roofOutlineStride,
      offsets: [...position, ...position],
      scales: [
        horizontalScale,
        horizontalScale,
        10,
        horizontalScale,
        horizontalScale,
        10,
        1,
        1,
      ],
    },
  ] as const;
}

export function encodeEdinburghMesh(
  mesh: MeshData<number[]>,
  x: number,
  y: number,
  zoom = edinburghMeshZoom,
) {
  const sections = meshComponents(x, y, zoom).map(
    ({ name, stride, offsets, scales }) => {
      const source = mesh[name];
      const vertices: number[] = [];
      const byValue = new Map<string, number>();
      const indices = new Uint32Array(source.length / stride);
      const packed = new Int16Array(stride);
      for (let vertex = 0; vertex < indices.length; vertex++) {
        for (let component = 0; component < stride; component++) {
          const value = Math.round(
            (source[vertex * stride + component] - (offsets[component] ?? 0)) *
              scales[component],
          );
          if (!Number.isFinite(value) || value < -32768 || value > 32767)
            throw new Error(
              `Edinburgh mesh ${x}/${y} has a vertex outside ${name} range`,
            );
          packed[component] = value;
        }
        const key = String.fromCharCode(...packed);
        let index = byValue.get(key);
        if (index === undefined) {
          index = vertices.length / stride;
          byValue.set(key, index);
          vertices.push(...packed);
        }
        indices[vertex] = index;
      }
      return {
        vertices,
        indices,
        stride,
        wide: vertices.length / stride > compactIndexCapacity,
      };
    },
  );
  const bytes = new ArrayBuffer(
    headerBytes +
      2 *
        sections.reduce(
          (total, { vertices, indices, wide }) =>
            total + vertices.length + indices.length * (wide ? 2 : 1),
          0,
        ),
  );
  const header = new DataView(bytes, 0, headerBytes);
  const useBytePlanes = zoom < 14;
  header.setUint32(0, useBytePlanes ? bytePlaneSignature : signature, true);
  header.setUint32(4, mesh.buildings, true);
  header.setUint32(8, mesh.surveyed, true);
  let cursor = 0;
  const data = new Uint16Array(bytes, headerBytes);
  const planes = new Uint8Array(bytes, headerBytes);
  // The high bytes of small deltas are mostly zero. Keeping them together
  // compresses the overview without changing its vertices or indices.
  const writeWord = useBytePlanes
    ? (word: number) => {
        planes[cursor + data.length] = word >>> 8;
        planes[cursor++] = word;
      }
    : (word: number) => {
        data[cursor++] = word;
      };
  // Adjacent vertices tend to have nearby coordinates and normals. Encode
  // deltas by attribute so gzip can compress those small changes together.
  const writeChannel = (
    values: ArrayLike<number>,
    start: number,
    step: number,
    wide = false,
  ) => {
    let previous = 0;
    for (let i = start; i < values.length; i += step) {
      const value = values[i];
      const difference = value - previous;
      const delta = wide ? difference : (difference << 16) >> 16;
      const packed = (delta << 1) ^ (delta >> 31);
      writeWord(packed);
      if (wide) writeWord(packed >>> 16);
      previous = value;
    }
  };
  for (const [
    index,
    { vertices, indices, stride, wide },
  ] of sections.entries()) {
    header.setUint32(12 + index * 8, vertices.length, true);
    header.setUint32(16 + index * 8, indices.length, true);
    for (let component = 0; component < stride; component++)
      writeChannel(vertices, component, stride);
    // Dense façade tiles can exceed 16-bit indices. The vertex count signals
    // the wider index channel, so compact sections keep their original bytes.
    writeChannel(indices, 0, 1, wide);
  }
  return bytes;
}

export function decodeEdinburghMesh(
  bytes: ArrayBuffer,
  x: number,
  y: number,
  zoom = edinburghMeshZoom,
  byteOffset = 0,
): EdinburghMesh {
  const length = bytes.byteLength - byteOffset;
  if (length < headerBytes || length % 2)
    throw new Error('Invalid Edinburgh mesh length');
  const header = new DataView(bytes, byteOffset, headerBytes);
  const format = header.getUint32(0, true);
  if (format !== signature && format !== bytePlaneSignature)
    throw new Error('Unknown Edinburgh mesh format');
  const components = meshComponents(x, y, zoom);
  const sizes = components.map(({ stride }, index) => {
    const vertices = header.getUint32(12 + index * 8, true);
    return {
      vertices,
      indices: header.getUint32(16 + index * 8, true),
      wide: vertices / stride > compactIndexCapacity,
    };
  });
  if (
    headerBytes +
      2 *
        sizes.reduce(
          (sum, { vertices, indices, wide }) =>
            sum + vertices + indices * (wide ? 2 : 1),
          0,
        ) !==
      length ||
    components.some(
      ({ stride }, i) => sizes[i].vertices % stride || sizes[i].indices % 3,
    )
  )
    throw new Error('Invalid Edinburgh mesh sections');
  const data = new Uint16Array(bytes, byteOffset + headerBytes);
  const planes = new Uint8Array(bytes, byteOffset + headerBytes);
  let cursor = 0;
  const readWord =
    format === bytePlaneSignature
      ? () => (planes[cursor + data.length] << 8) | planes[cursor++]
      : () => data[cursor++];
  const readDelta = (wide = false) => {
    let value = readWord();
    if (wide) value |= readWord() << 16;
    return (value >>> 1) ^ -(value & 1);
  };
  const [roofs, walls, outlines] = sizes.map(
    ({ vertices, indices: count, wide }, index) => {
      const { stride, offsets, scales } = components[index];
      const unpacked = new Float32Array(vertices);
      for (let component = 0; component < stride; component++) {
        let previous = 0;
        for (let i = component; i < vertices; i += stride) {
          previous = ((previous + readDelta()) << 16) >> 16;
          unpacked[i] =
            previous / scales[component] + (offsets[component] ?? 0);
        }
      }
      const indices = wide ? new Uint32Array(count) : new Uint16Array(count);
      let previous = 0;
      for (let i = 0; i < count; i++) {
        previous += readDelta(wide);
        if (!wide) previous &= 65535;
        const from = previous * stride;
        if (from < 0 || from >= vertices)
          throw new Error('Invalid Edinburgh mesh index');
        indices[i] = previous;
      }
      return { vertices: unpacked, indices };
    },
  );
  return {
    roofs,
    walls,
    outlines,
    buildings: header.getUint32(4, true),
    surveyed: header.getUint32(8, true),
  };
}
