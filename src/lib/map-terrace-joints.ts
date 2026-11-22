import { MercatorCoordinate } from 'maplibre-gl';

type Point = { x: number; y: number };

export type FacadeJoints = {
  partyWalls: readonly Point[];
  divisions: ReadonlyArray<readonly [Point, Point]>;
};

function mercatorPoint(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every(
      (coordinate) =>
        typeof coordinate === 'number' && Number.isFinite(coordinate),
    )
  )
    return;
  return MercatorCoordinate.fromLngLat([value[0], value[1]]);
}

export function parseFacadeJoints(
  properties: Record<string, unknown>,
): FacadeJoints {
  const sites = properties.party_wall_joints;
  const lines = properties.terrace_dividers;
  return {
    partyWalls: Array.isArray(sites)
      ? sites.map(mercatorPoint).filter((point) => point !== undefined)
      : [],
    divisions: Array.isArray(lines)
      ? lines.flatMap((line) => {
          if (!Array.isArray(line) || line.length !== 2) return [];
          const a = mercatorPoint(line[0]);
          const b = mercatorPoint(line[1]);
          return a && b ? [[a, b] as const] : [];
        })
      : [],
  };
}

const cross = (ax: number, ay: number, bx: number, by: number) =>
  ax * by - ay * bx;

/** Return the joint positions along an exposed mapped wall, from its start to its end. */
export function facadeJointFractions(
  start: Point,
  end: Point,
  metres: number,
  joints: FacadeJoints,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const tolerance = 0.25 / metres;
  const fractions: number[] = [];
  const include = (t: number) => {
    if (t < -tolerance || t > 1 + tolerance) return;
    fractions.push(t <= tolerance ? 0 : t >= 1 - tolerance ? 1 : t);
  };
  for (const point of joints.partyWalls) {
    const x = point.x - start.x;
    const y = point.y - start.y;
    if (Math.abs(cross(dx, dy, x, y)) <= tolerance * length ** 2)
      include((x * dx + y * dy) / length ** 2);
  }
  for (const [a, b] of joints.divisions) {
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const determinant = cross(dx, dy, sx, sy);
    // Apply a row division to the front and back runs. Ignore cross walls
    // and the small perpendicular returns in a stepped frontage.
    if (Math.abs(determinant) <= length * Math.hypot(sx, sy) * 0.78) continue;
    const x = a.x - start.x;
    const y = a.y - start.y;
    const u = cross(x, y, dx, dy) / determinant;
    if (u >= 0 && u <= 1) include(cross(x, y, sx, sy) / determinant);
  }
  fractions.sort((a, b) => a - b);
  return fractions.filter(
    (fraction, i) => i === 0 || (fraction - fractions[i - 1]) * metres > 0.1,
  );
}
