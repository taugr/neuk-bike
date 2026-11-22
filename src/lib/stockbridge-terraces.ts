import { MercatorCoordinate } from 'maplibre-gl';

type Point = { x: number; y: number };
type LngLat = [number, number];

// Street axes from the Edinburgh OpenStreetMap snapshot. These select the
// pilot rows and orient their entrances toward the street.
const streets: LngLat[][] = [
  // Malta Terrace
  [
    [-3.21014, 55.959388],
    [-3.2092, 55.959695],
  ],
  // Saxe-Coburg Place
  [
    [-3.207942, 55.960348],
    [-3.208088, 55.960204],
    [-3.209352, 55.960522],
    [-3.209444, 55.960576],
    [-3.209484, 55.960664],
    [-3.20944, 55.96075],
    [-3.209335, 55.960802],
    [-3.20918, 55.960825],
    [-3.207938, 55.960517],
  ],
  // Dean Terrace, Carlton Street and residential Leslie Place
  [
    [-3.211219, 55.956279],
    [-3.210377, 55.956854],
    [-3.209967, 55.957142],
    [-3.20952, 55.957498],
    [-3.209065, 55.957987],
  ],
  [
    [-3.211412, 55.95751],
    [-3.211357, 55.957475],
    [-3.210377, 55.956854],
  ],
  [
    [-3.211412, 55.95751],
    [-3.21016, 55.958127],
  ],
];
const streetEdges = streets.flatMap((street) =>
  street.slice(1).map((end, i) => {
    const start = MercatorCoordinate.fromLngLat(street[i]);
    const point = MercatorCoordinate.fromLngLat(end);
    const x = point.x - start.x;
    const y = point.y - start.y;
    return { start, x, y, length: Math.hypot(x, y) };
  }),
);
const northwest = MercatorCoordinate.fromLngLat([-3.212, 55.96105]);
const southeast = MercatorCoordinate.fromLngLat([-3.20755, 55.95615]);

export function stockbridgeTerraceFaces(
  center: Point,
  ring: readonly Point[],
  metresPerUnit: number,
  hasTerraceJoints: boolean,
) {
  if (
    !hasTerraceJoints ||
    center.x < northwest.x ||
    center.x > southeast.x ||
    center.y < northwest.y ||
    center.y > southeast.y
  )
    return;

  const edges = ring.map((start, i) => {
    const end = ring[(i + 1) % ring.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return { start, end, dx, dy, length: Math.hypot(dx, dy) };
  });
  const area = edges.reduce(
    (sum, { start, end }) =>
      sum +
      (start.x - center.x) * (end.y - center.y) -
      (start.y - center.y) * (end.x - center.x),
    0,
  );
  const winding = Math.sign(area);
  const normal = ({ dx, dy, length }: (typeof edges)[number]) => ({
    x: (winding * dy) / length,
    y: (winding * -dx) / length,
  });
  const faces = new Map<number, 'front' | 'rear'>();
  edges.forEach((edge, i) => {
    if (edge.length * metresPerUnit < 3.6) return;
    const x = edge.start.x + edge.dx / 2;
    const y = edge.start.y + edge.dy / 2;
    const outward = normal(edge);
    const facesStreet = streetEdges.some((street) => {
      if (
        Math.abs(edge.dx * street.x + edge.dy * street.y) <
        0.86 * edge.length * street.length
      )
        return false;
      const u =
        ((x - street.start.x) * street.x + (y - street.start.y) * street.y) /
        street.length ** 2;
      if (u < -0.12 || u > 1.12) return false;
      const end = Math.max(0, Math.min(1, u));
      const sx = street.start.x + street.x * end - x;
      const sy = street.start.y + street.y * end - y;
      const distance = Math.hypot(sx, sy) * metresPerUnit;
      return (
        distance >= 2 &&
        distance <= 15 &&
        (sx * outward.x + sy * outward.y) * metresPerUnit >= 0.76 * distance
      );
    });
    if (facesStreet) faces.set(i, 'front');
  });
  if (!faces.size) return;
  const fronts = [...faces.keys()].map((index) => normal(edges[index]));
  edges.forEach((edge, i) => {
    if (faces.has(i) || edge.length * metresPerUnit < 4) return;
    const outward = normal(edge);
    if (
      !fronts.some((front) => front.x * outward.x + front.y * outward.y < -0.9)
    )
      return;
    const projection = (point: Point) =>
      (point.x - edge.start.x) * outward.x +
      (point.y - edge.start.y) * outward.y;
    // A rear wall should be near the outside of the footprint. Skip deep
    // returns where a window would look into the adjacent extension.
    if (ring.every((point) => projection(point) * metresPerUnit < 3.2))
      faces.set(i, 'rear');
  });
  return faces;
}
