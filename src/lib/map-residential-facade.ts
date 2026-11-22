import type { HistoricWall } from './edinburgh-historic-facades';

type Opening = {
  left: number;
  right: number;
  foot: number;
  head: number;
  kind: 'sash' | 'door' | 'shop';
  finish: number;
};

type Surface = readonly [u: number, v: number, kind: number];
type Vertex = (
  fraction: number,
  height: number,
  depth: number,
  stone: number,
  light: number,
  surface: Surface | undefined,
  section: number,
) => number[];

/** Build dressed stone around openings and place the sash or door behind the wall. */
export function appendResidentialFacade(
  vertices: number[],
  {
    cuts,
    joints,
    metres,
    bottom,
    street,
    eave,
    ground,
    masonry,
    doorSide,
    historic,
    vertex,
  }: {
    cuts: readonly number[];
    joints: readonly number[];
    metres: number;
    bottom: number;
    street: boolean;
    eave: (fraction: number) => number;
    ground: (fraction: number) => number;
    masonry: number;
    doorSide: boolean;
    historic?: HistoricWall;
    vertex: Vertex;
  },
) {
  const sections = [0, ...joints.filter((joint) => joint > 0 && joint < 1), 1];
  const openings: Opening[] = [];
  const oldTown = historic?.district === 'old-town';
  const narrow = oldTown ? 0.46 : 0.56;
  for (let i = 1; i < sections.length; i++) {
    const first = sections[i - 1];
    const last = sections[i];
    const width = (last - first) * metres;
    if (width < 3.6 || width > (historic ? 70 : 15)) continue;
    const midpoint = (first + last) / 2;
    const pavement = ground(midpoint);
    const available =
      Math.min(
        eave(first + 0.12 * (last - first)),
        eave(midpoint),
        eave(last - 0.12 * (last - first)),
      ) - pavement;
    if (available < 3.2 || available > (historic ? 34 : 15)) continue;
    const typicalStorey = oldTown ? 2.72 : historic ? 3.18 : 2.92;
    const levels = historic?.levels;
    const floors = Math.min(
      historic ? 7 : 4,
      Math.max(
        1,
        levels && available / levels >= 2.35 && available / levels <= 4
          ? levels
          : Math.floor((available + 0.55) / typicalStorey),
      ),
    );
    const floorHeight = Math.min(historic ? 3.8 : 3.45, available / floors);
    const bays = historic
      ? Math.max(2, Math.round(width / (oldTown ? 2.08 : 2.85)))
      : width >= 9.8
        ? 4
        : width >= 6.45
          ? 3
          : 2;
    const margins = Math.min(1.1, width / (bays + 1));
    const bayWidth = (width - 2 * margins) / (bays - 1);
    const positions = Array.from(
      { length: bays },
      (_, bay) => first + (margins + bay * bayWidth) / metres,
    );
    const bayAt = (t: number) =>
      Math.max(
        0,
        Math.min(
          bays - 1,
          Math.round(((t - first) * metres - margins) / bayWidth),
        ),
      );
    const shops = new Map<number, number>();
    const doors = new Map<number, number>();
    for (const t of historic?.shops ?? []) {
      if (t > first && t < last) shops.set(bayAt(t), t);
    }
    for (const t of historic?.entrances ?? []) {
      if (t > first && t < last) doors.set(bayAt(t), t);
    }
    if (street && !doors.size) {
      const doorBay = doorSide ? bays - 1 : 0;
      const candidates = doorSide
        ? [...positions.keys()].reverse()
        : [...positions.keys()];
      const bay = shops.size
        ? candidates.find((index) => !shops.has(index))
        : doorBay;
      if (bay !== undefined) doors.set(bay, positions[bay]);
    }
    for (let floor = 0; floor < floors; floor++) {
      for (let bay = 0; bay < bays; bay++) {
        const door = street && floor === 0 && doors.has(bay);
        const shop = street && floor === 0 && !door && shops.has(bay);
        const layoutCenter = positions[bay];
        // Snap mapped points to a bay without pushing an opening into the
        // next bay or the jamb on a neighbouring property.
        const shift =
          (door ? doors.get(bay) : shop ? shops.get(bay) : undefined) ??
          layoutCenter;
        const tolerance = Math.min(0.28, 0.065 * bayWidth) / metres;
        const center = Math.max(
          layoutCenter - tolerance,
          Math.min(layoutCenter + tolerance, shift),
        );
        const half =
          Math.min(
            shop ? 1.63 : door ? 0.6 : narrow,
            bayWidth * (shop ? 0.39 : 0.3),
            (center - first) * metres - 0.23,
            (last - center) * metres - 0.23,
          ) / metres;
        const left = center - half;
        const right = center + half;
        const localGround =
          oldTown && street
            ? pavement +
              Math.max(-1.15, Math.min(1.15, ground(center) - pavement))
            : pavement;
        const sillHeight =
          floor === 0
            ? 0.85
            : historic && !oldTown && floor === 1
              ? 0.48
              : 0.64;
        const foot =
          localGround +
          floor * floorHeight +
          (door ? 0.12 : shop ? 0.15 : sillHeight);
        const top =
          localGround +
          floor * floorHeight +
          (door
            ? 2.68
            : shop
              ? Math.min(2.88, floorHeight - 0.16)
              : sillHeight +
                Math.min(
                  floor === floors - 1
                    ? 1.49
                    : historic && !oldTown && floor === 1
                      ? 2.25
                      : 1.83,
                  floorHeight -
                    (floor === 1 && historic && !oldTown ? 0.68 : 0.96),
                ));
        const head = Math.min(
          top,
          eave(left) - 0.28,
          eave(right) - 0.28,
          ...cuts
            .filter((cut) => cut > left && cut < right)
            .map((cut) => eave(cut) - 0.28),
        );
        if (half > 0 && head - foot >= (door || shop ? 1.96 : 0.75))
          openings.push({
            left,
            right,
            foot,
            head,
            kind: door ? 'door' : shop ? 'shop' : 'sash',
            finish: (i + bay + masonry) % 3,
          });
      }
    }
  }
  if (!openings.length) return 0;
  const breaks = [
    ...new Set([
      ...cuts,
      ...openings.flatMap(({ left, right }) => [left, right]),
    ]),
  ].sort((a, b) => a - b);
  const quad = (a: number[], b: number[], c: number[], d: number[]) =>
    vertices.push(...a, ...b, ...c, ...a, ...c, ...d);

  for (let i = 1; i < breaks.length; i++) {
    const l = breaks[i - 1];
    const r = breaks[i];
    const middle = (l + r) / 2;
    const current = joints.findIndex((value) => value > middle);
    const section = current < 0 ? joints.length : current;
    const point = (
      t: number,
      height: number,
      depth: number,
      light = 1,
      stone = masonry,
      surface?: Surface,
    ) => vertex(t, height, depth, stone, light, surface, section);
    const face = (
      l0: number,
      r0: number,
      loL: number,
      loR: number,
      hiL: number,
      hiR: number,
      depth: number,
      light = 1,
      stone = masonry,
    ) => {
      if (l0 >= r0 || (hiL <= loL && hiR <= loR)) return;
      quad(
        point(l0, loL, depth, light, stone),
        point(r0, loR, depth, light, stone),
        point(r0, hiR, depth, light, stone),
        point(l0, hiL, depth, light, stone),
      );
    };
    let low = bottom;
    for (const opening of openings.filter(
      ({ left, right }) => left < middle && right > middle,
    )) {
      const { left, right, foot, head, kind, finish } = opening;
      const door = kind === 'door';
      const shop = kind === 'shop';
      const recess = door ? -0.51 : shop ? -0.43 : oldTown ? -0.42 : -0.36;
      const trim = 7;
      const lip = door || shop ? 0.16 : 0.11;
      const sill = door ? 0.28 : 0.22;
      const band = (
        height: number,
        back: number,
        front: number,
        light: number,
        stone = trim,
      ) =>
        quad(
          point(l, height, back, light, stone),
          point(r, height, back, light, stone),
          point(r, height, front, light, stone),
          point(l, height, front, light, stone),
        );
      const jamb = (
        u: number,
        back: number,
        front: number,
        light: number,
        stone = trim,
      ) =>
        quad(
          point(u, foot, back, light, stone),
          point(u, foot, front, light, stone),
          point(u, head, front, light, stone),
          point(u, head, back, light, stone),
        );
      const panel = (u: number, y: number, t: number) =>
        point(
          u,
          y,
          recess,
          1,
          shop ? 8 + finish * 2 : door ? (doorSide ? 8 : 12) : 6,
          [(u - left) / (right - left), t, shop ? 4 : door ? 3 : 2],
        );

      face(l, r, low, low, foot, foot, 0);
      quad(
        panel(l, foot, 0),
        panel(r, foot, 0),
        panel(r, head, 1),
        panel(l, head, 1),
      );
      band(foot, recess, sill, 0.99);
      band(head, recess, lip, 0.49);
      if (shop) {
        const fascia = head - 0.34;
        const paint = 8 + finish * 2;
        face(l, r, fascia, fascia, head, head, lip + 0.04, 0.9, paint);
        band(fascia, recess, lip + 0.04, 0.67, paint);
      }
      face(l, r, foot - 0.13, foot - 0.13, foot, foot, sill, 0.91, trim);
      band(foot - 0.13, 0, sill, 0.63);
      face(l, r, head, head, head + 0.14, head + 0.14, lip, 0.96, trim);
      band(head + 0.14, 0, lip, 1.06);
      if (l === left) {
        jamb(l, recess, lip, 0.63);
        face(l - 0.1 / metres, l, foot, foot, head, head, lip, 0.93, trim);
      }
      if (r === right) {
        jamb(r, recess, lip, 0.82);
        face(r, r + 0.1 / metres, foot, foot, head, head, lip, 1.02, trim);
      }
      low = head;
    }
    face(
      l,
      r,
      Math.min(low, eave(l)),
      Math.min(low, eave(r)),
      eave(l),
      eave(r),
      0,
    );
  }
  return openings.length;
}

export const residentialFacadeShader = `
vec3 shadeResidentialOpening(float material, vec2 uv, float kind) {
  vec2 pixel = max(fwidth(uv), vec2(0.012));
  vec2 edge = min(uv, 1.0 - uv);
  float frame = 1.0 - min(smoothstep(0.035, 0.10 + pixel.x * 0.40, edge.x),
    smoothstep(0.025, 0.065 + pixel.y * 0.38, edge.y));
  float crossbar = 1.0 - smoothstep(0.01, 0.037 + pixel.y * 0.34, abs(uv.y - 0.50));
  float shadow = mix(0.60, 1.0, smoothstep(0.02, 0.22, edge.x)) *
    mix(0.65, 1.0, smoothstep(0.02, 0.28, 1.0 - uv.y));
  vec3 glass = mix(vec3(0.19, 0.22, 0.23), vec3(0.34, 0.40, 0.43), smoothstep(0.06, 0.9, uv.y));
  if (kind < 2.5) {
    float glazing = 1.0 - smoothstep(0.008, 0.028 + pixel.x * 0.32, abs(uv.x - 0.50));
    float sash = max(frame, max(crossbar, glazing * (1.0 - smoothstep(0.19, 0.38, pixel.x))));
    return mix(glass, vec3(0.71, 0.70, 0.65), sash) * shadow;
  }
  if (kind > 3.5) {
    vec3 surround = material < 9.0 ? vec3(0.21, 0.18, 0.17) :
      material < 11.0 ? vec3(0.21, 0.25, 0.28) : vec3(0.20, 0.30, 0.24);
    float mullion = 1.0 - smoothstep(0.015, 0.051 + pixel.x * 0.24, abs(uv.x - 0.64));
    float rail = 1.0 - smoothstep(0.014, 0.040 + pixel.y * 0.22, abs(uv.y - 0.68));
    float plinth = 1.0 - smoothstep(0.14, 0.18 + pixel.y * 0.22, uv.y);
    return mix(glass * 1.18, surround, max(frame, max(plinth, max(mullion, rail)))) * shadow;
  }
  vec3 paint = material < 10.0 ? vec3(0.13, 0.22, 0.29) : vec3(0.17, 0.26, 0.21);
  float panel = smoothstep(0.13, 0.20, edge.x) * smoothstep(0.07, 0.13, edge.y);
  float fanlight = smoothstep(0.75, 0.77 + pixel.y * 0.33, uv.y);
  return mix(mix(paint, paint * 0.68, panel), glass, fanlight) * shadow + frame * 0.032;
}`;
