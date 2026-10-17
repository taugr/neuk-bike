import type { WindPoint } from './wind';

type Bounds = { west: number; east: number; south: number; north: number };
const mercatorY = (lat: number) =>
  (1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2;

/** A nested world grid, independent of camera centre. Zoom changes density,
 * never the location of an existing anchor. These are display samples, not
 * weather stations or extra forecast observations. */
export function windGridAnchors(bounds: Bounds, zoom: number) {
  const cells = 2 ** (Math.floor(zoom) + 2);
  const west = Math.ceil(((bounds.west + 180) / 360) * cells);
  const east = Math.floor(((bounds.east + 180) / 360) * cells);
  const north = Math.ceil(mercatorY(bounds.north) * cells);
  const south = Math.floor(mercatorY(bounds.south) * cells);
  const anchors: { id: string; point: WindPoint }[] = [];
  for (let y = north; y <= south; y++) {
    for (let x = west; x <= east; x++) {
      // Keep half the global lattice: density does not depend on the camera.
      if ((x + y) % 2 !== 0) continue;
      const point: WindPoint = [
        (x / cells) * 360 - 180,
        (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / cells))) * 180) / Math.PI,
      ];
      anchors.push({ id: `${x / cells}:${y / cells}`, point });
    }
  }
  return anchors;
}

/** Stable geographic label subset; panning never reassigns labels. */
export function windAnchorHasLabel(id: string, mobile: boolean) {
  let hash = 0;
  for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % (mobile ? 5 : 3) === 0;
}
