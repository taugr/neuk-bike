import { decodeEdinburghMesh, edinburghMeshZoom } from './edinburgh-mesh';

export const edinburghOverviewZoom = 14;
export const edinburghCityOverviewZoom = 13;
const span = 2 ** (edinburghMeshZoom - edinburghOverviewZoom);
export const edinburghOverviewChildCount = span ** 2;
export const edinburghOverviewHeaderBytes = edinburghOverviewChildCount * 8;

export function edinburghOverviewChild(
  x: number,
  y: number,
  childZoom = edinburghMeshZoom,
  parentZoom = edinburghOverviewZoom,
) {
  const span = 2 ** (childZoom - parentZoom);
  return {
    parent: `${Math.floor(x / span)}/${Math.floor(y / span)}`,
    slot: (y % span) * span + (x % span),
  };
}

export function decodeEdinburghOverview(
  bytes: ArrayBuffer,
  x: number,
  y: number,
  zoom = edinburghOverviewZoom,
) {
  if (bytes.byteLength <= edinburghOverviewHeaderBytes)
    throw new Error('Invalid Edinburgh overview mesh');
  const mesh = decodeEdinburghMesh(
    bytes,
    x,
    y,
    zoom,
    edinburghOverviewHeaderBytes,
  );
  // Keep the small lookup tables without retaining the decompressed mesh.
  const ends = new Uint32Array(
    bytes,
    0,
    edinburghOverviewChildCount * 2,
  ).slice();
  const roofEnds = ends.subarray(0, edinburghOverviewChildCount);
  const wallEnds = ends.subarray(edinburghOverviewChildCount);
  const valid = (offsets: Uint32Array, count: number) =>
    offsets.at(-1) === count &&
    offsets.every((end, i) => end % 3 === 0 && (!i || end >= offsets[i - 1]));
  if (
    !valid(roofEnds, mesh.roofs.indices.length) ||
    !valid(wallEnds, mesh.walls.indices.length)
  )
    throw new Error('Invalid Edinburgh overview tile ranges');
  return { mesh, roofEnds, wallEnds };
}

export type EdinburghOverviewMesh = ReturnType<typeof decodeEdinburghOverview>;
export type MeshDrawRange = { first: number; count: number };

/** Skip children already drawn at full detail. Keep adjacent ranges together. */
export function edinburghOverviewRanges(ends: Uint32Array, covered: number) {
  const ranges: MeshDrawRange[] = [];
  let first = 0;
  for (const [slot, end] of ends.entries()) {
    if (!(covered & (1 << slot)) && end > first) {
      const last = ranges.at(-1);
      if (last && last.first + last.count === first)
        last.count = end - last.first;
      else ranges.push({ first, count: end - first });
    }
    first = end;
  }
  return ranges;
}
