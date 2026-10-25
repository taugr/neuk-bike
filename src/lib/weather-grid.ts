import type { ParkingMapBounds } from './map-pins';

/** A bounded 4×5 request at every scale. Wider views spread the same samples
 * farther apart; zooming in requests finer detail instead of magnifying a
 * country forecast. Quantized, padded bounds also absorb small camera moves. */
export function weatherGridBounds(
  view: ParkingMapBounds,
): ParkingMapBounds | null {
  const { west, east, south, north } = view;
  if (
    ![west, east, south, north].every(Number.isFinite) ||
    west >= east ||
    south >= north ||
    west < -180 ||
    east > 180 ||
    south < -80 ||
    north > 80
  )
    return null;
  const extent = Math.max(east - west, north - south);
  const span =
    extent <= 0.04
      ? 0.08
      : extent <= 0.15
        ? 0.3
        : extent <= 0.5
          ? 1
          : Math.max(2, 2 ** Math.ceil(Math.log2(extent / 0.75)));
  const step = span / 4;
  const lng = Math.round((west + east) / 2 / step) * step;
  const lat = Math.round((south + north) / 2 / step) * step;
  return {
    west: Math.max(-180, lng - span / 2),
    east: Math.min(180, lng + span / 2),
    south: Math.max(-80, lat - span / 2),
    north: Math.min(80, lat + span / 2),
  };
}

export function weatherBoundsOverlap(a: ParkingMapBounds, b: ParkingMapBounds) {
  return (
    a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south
  );
}
