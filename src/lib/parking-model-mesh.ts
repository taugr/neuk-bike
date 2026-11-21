import type { ModelKind } from './parking-model-catalog';

export type Vec3 = [number, number, number];
type Color = [number, number, number, number];
export const parkingVertexStride = 11;
/** Satellite-only materials retain their hue, with enough lightness to read
 * against imagery. Geometry and the street-map palette are untouched. */
export function satelliteParkingColor(color: Color): Color {
  if (color[3] < 1) return [0.76, 0.9, 0.94, 0.42];
  if (color[0] === 0.62 && color[1] === 0.71 && color[2] === 0.73)
    return [0.94, 0.97, 0.97, 1];
  const lightness = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
  const lift = Math.max(0, (0.56 - lightness) / Math.max(0.001, 1 - lightness));
  return [
    color[0] + (1 - color[0]) * lift,
    color[1] + (1 - color[1]) * lift,
    color[2] + (1 - color[2]) * lift,
    color[3],
  ];
}
export type ParkingMesh = {
  opaque: Float32Array;
  glass: Float32Array;
  shadow: Float32Array;
};
const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]) as Vec3;
const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3;
const mul = (a: Vec3, s: number): Vec3 => a.map((v) => v * s) as Vec3;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v: Vec3): Vec3 => mul(v, 1 / Math.hypot(...v));

/** Real triangle surfaces: round tubing and a continuous barrel-vault roof.
 * Local coordinates are east/north/up. These remain illustrative symbols. */
export function createParkingMesh(
  kind: ModelKind,
  covered: boolean,
  selected = false,
  satelliteContrast = false,
): ParkingMesh {
  const opaque: number[] = [],
    glass: number[] = [],
    shadow: number[] = [];
  // The mesh stores a finish separately so the satellite palette can brighten
  // surfaces without turning painted steel, timber and rubber into bare metal.
  const accent: Color = [20 / 255, 184 / 255, 166 / 255, 1];
  const steel: Color = [0.62, 0.71, 0.73, 1];
  const hardware: Color = [0.43, 0.47, 0.48, 1];
  const frame: Color = selected ? accent : [0.19, 0.23, 0.25, 1];
  const body: Color = selected ? accent : [0.26, 0.4, 0.36, 1];
  const trim: Color = [0.37, 0.41, 0.4, 1];
  const rubber: Color = [0.15, 0.16, 0.16, 1];
  // Finish indices match the shader and survive satellite palette changes.
  const finishes = new Map<Color, number>([
    [steel, 1],
    [hardware, 1],
    [frame, 2],
    [body, 2],
    [trim, 2],
  ]);
  const materials = new WeakMap<Color, Color>();
  const vertex = (out: number[], p: Vec3, n: Vec3, color: Color) => {
    const finish = finishes.get(color) ?? 0;
    if (satelliteContrast) {
      if (!materials.has(color))
        materials.set(color, satelliteParkingColor(color));
      color = materials.get(color)!;
    }
    out.push(...p, ...n, ...color, finish);
  };
  const contact = (x: number, y: number, width: number, depth: number) => {
    // Each support gets a tight shadow that shares its map anchor. These quads
    // are visual only and are excluded from placement bounds and hit testing.
    const w = width / 2 + 0.13;
    const d = depth / 2 + 0.13;
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const [u, v] = corners[i];
      shadow.push(x + w * u, y + d * v, 0.017, u, v, 0, 0, 0, 0, 1, 6);
    }
  };
  const quad = (
    out: number[],
    points: Vec3[],
    normals: Vec3[],
    color: Color,
  ) => {
    for (const i of [0, 1, 2, 0, 2, 3])
      vertex(out, points[i], normals[i], color);
  };
  const flatQuad = (face: Vec3[], color: Color) => {
    const normal = unit(cross(sub(face[1], face[0]), sub(face[2], face[0])));
    quad(opaque, face, [normal, normal, normal, normal], color);
  };
  const box = (
    x: number,
    y: number,
    w: number,
    d: number,
    b: number,
    h: number,
    color: Color,
    slope = 0,
    bottomSlope = 0,
  ) => {
    if (b >= 0.01 && b < 0.027) contact(x, y, w, d);
    const p: Vec3[] = [
      [x - w / 2, y - d / 2, b],
      [x + w / 2, y - d / 2, b],
      [x + w / 2, y + d / 2, b],
      [x - w / 2, y + d / 2, b],
      [x - w / 2, y - d / 2, h],
      [x + w / 2, y - d / 2, h],
      [x + w / 2, y + d / 2, h],
      [x - w / 2, y + d / 2, h],
    ];
    // Lean-to roofs match the slope of the wall below them.
    for (let i = 0; i < 4; i++) {
      p[i][2] += p[i][1] * bottomSlope;
      p[i + 4][2] += p[i + 4][1] * slope;
    }
    for (const indices of [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ]) {
      flatQuad(
        indices.map((i) => p[i]),
        color,
      );
    }
  };
  const bevelBox = (
    x: number,
    y: number,
    w: number,
    d: number,
    b: number,
    h: number,
    color: Color,
    bevel: number,
    baseInset = 0,
  ) => {
    if (b < 0.027) contact(x, y, w, d);
    const ring = (z: number, inset: number, taper = 0): Vec3[] => {
      const a = w / 2 - inset - taper,
        c = d / 2 - inset - taper;
      const r = bevel - inset * 0.5;
      return [
        [-a + r, -c],
        [a - r, -c],
        [a, -c + r],
        [a, c - r],
        [a - r, c],
        [-a + r, c],
        [-a, c - r],
        [-a, -c + r],
      ].map(([dx, dy]): Vec3 => [x + dx, y + dy, z]);
    };
    const rings = [
      ring(b, bevel * 0.65, baseInset),
      ring(b + bevel, 0, baseInset),
      ring(h - bevel, 0),
      ring(h, bevel * 0.65),
    ];
    for (let level = 1; level < rings.length; level++) {
      const lower = rings[level - 1],
        upper = rings[level];
      for (let i = 0; i < lower.length; i++) {
        const next = (i + 1) % lower.length;
        flatQuad([lower[i], lower[next], upper[next], upper[i]], color);
      }
    }
    for (const [rim, direction] of [
      [rings[0], -1],
      [rings[3], 1],
    ] as const) {
      for (let i = 1; i < rim.length - 1; i++)
        for (const p of [rim[0], rim[i], rim[i + 1]])
          vertex(opaque, p, [0, 0, direction], color);
    }
  };
  const tube = (
    path: Vec3[],
    radius: number | number[],
    color: Color,
    sides = 12,
    capColor = color,
  ) => {
    const closed = Math.hypot(...sub(path[0], path[path.length - 1])) < 1e-6;
    const tangents = path.map((_, i) =>
      unit(
        sub(
          path[
            closed && i === path.length - 1
              ? 1
              : Math.min(i + 1, path.length - 1)
          ],
          path[closed && i === 0 ? path.length - 2 : Math.max(0, i - 1)],
        ),
      ),
    );
    let previousSide: Vec3 | undefined;
    let firstSide: Vec3 | undefined;
    const rings = path.map((p, i) => {
      const tangent = tangents[i];
      // Carry the cross section through bends, avoiding sudden twists when a
      // tube transitions from vertical to horizontal or turns across the map.
      const projected =
        previousSide &&
        sub(previousSide, mul(tangent, dot(previousSide, tangent)));
      const side =
        closed && i === path.length - 1
          ? firstSide!
          : unit(
              projected && Math.hypot(...projected) > 1e-6
                ? projected
                : cross(
                    tangent,
                    Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0],
                  ),
            );
      previousSide = side;
      firstSide ??= side;
      const up = cross(tangent, side);
      const r = typeof radius === 'number' ? radius : radius[i];
      let slope = 0;
      if (typeof radius !== 'number') {
        const before = Math.max(0, i - 1),
          after = Math.min(i + 1, path.length - 1);
        slope =
          (radius[after] - radius[before]) /
          Math.hypot(...sub(path[after], path[before]));
      }
      return Array.from({ length: sides }, (_, j) => {
        const angle = (j * Math.PI * 2) / sides;
        const normal = add(
          mul(side, Math.cos(angle)),
          mul(up, Math.sin(angle)),
        );
        return {
          p: add(p, mul(normal, r)),
          n: slope ? unit(sub(normal, mul(tangent, slope))) : normal,
        };
      });
    });
    for (let i = 0; i < path.length - 1; i++)
      for (let j = 0; j < sides; j++) {
        const k = (j + 1) % sides;
        const ring = [
          rings[i][j],
          rings[i + 1][j],
          rings[i + 1][k],
          rings[i][k],
        ];
        quad(
          opaque,
          ring.map((v) => v.p),
          ring.map((v) => v.n),
          color,
        );
      }
    for (const i of closed ? [] : [0, path.length - 1])
      for (let j = 0; j < sides; j++) {
        const n = mul(tangents[i], i === 0 ? -1 : 1);
        vertex(opaque, path[i], n, capColor);
        vertex(opaque, rings[i][j].p, n, capColor);
        vertex(opaque, rings[i][(j + 1) % sides].p, n, capColor);
      }
  };
  const flange = (x: number, y: number, radius: number, color = hardware) => {
    contact(x, y, radius * 2, radius * 2);
    tube(
      [
        [x, y, 0.012],
        [x, y, 0.03],
      ],
      [radius, radius * 0.94],
      color,
      10,
    );
    for (let i = 0; i < 3; i++) {
      const angle = (i * 2 * Math.PI) / 3;
      const bx = x + radius * 0.72 * Math.cos(angle);
      const by = y + radius * 0.72 * Math.sin(angle);
      // The bottom is embedded in the plate. Only the exposed hex head needs faces.
      const head: Vec3[] = Array.from({ length: 6 }, (_, j) => [
        bx + 0.017 * Math.cos((j * Math.PI) / 3),
        by + 0.017 * Math.sin((j * Math.PI) / 3),
        0.045,
      ]);
      for (let j = 0; j < head.length; j++) {
        const a = head[j],
          b = head[(j + 1) % head.length];
        flatQuad([[a[0], a[1], 0.029], [b[0], b[1], 0.029], b, a], steel);
      }
      for (let j = 1; j < head.length - 1; j++)
        for (const p of [head[0], head[j], head[j + 1]])
          vertex(opaque, p, [0, 0, 1], steel);
    }
  };
  const hoop = (
    x: number,
    y: number,
    w: number,
    h: number,
    radius = 0.048,
    alongDepth = false,
  ) => {
    const bend = Math.min(w * 0.32, h * 0.17);
    const left = x - w / 2;
    const right = x + w / 2;
    const shoulder = h - bend;
    const path: Vec3[] = [[left, y, 0.028]];
    for (let corner = 0; corner < 2; corner++) {
      const cx = corner === 0 ? left + bend : right - bend;
      for (let i = 0; i <= 5; i++) {
        const angle = Math.PI * (1 - corner / 2 - i / 10);
        path.push([
          cx + Math.cos(angle) * bend,
          y,
          shoulder + Math.sin(angle) * bend,
        ]);
      }
    }
    path.push([right, y, 0.028]);
    tube(
      alongDepth ? path.map(([px, , z]): Vec3 => [x, y + px - x, z]) : path,
      radius,
      steel,
    );
  };
  const line = (a: Vec3, b: Vec3, radius = 0.045, color = steel) =>
    tube([a, b], radius, color);
  const ring = (
    x: number,
    y: number,
    z: number,
    radius: number,
    thickness = 0.04,
  ) =>
    tube(
      Array.from({ length: 25 }, (_, i): Vec3 => [
        x + Math.cos((i * Math.PI) / 12) * radius,
        y,
        z + Math.sin((i * Math.PI) / 12) * radius,
      ]),
      thickness,
      steel,
      10,
    );
  const foot = (x: number, y: number) => {
    box(x, y, 0.22, 0.22, 0.012, 0.061, frame);
    for (const dx of [-0.077, 0.077])
      box(x + dx, y, 0.032, 0.032, 0.06, 0.085, hardware);
  };
  const channel = (x: number, z: number, length = 2.05) => {
    box(x, 0, 0.19, length, z, z + 0.045, steel);
    for (const side of [-1, 1])
      box(x + side * 0.11, 0, 0.035, length, z, z + 0.11, hardware);
    box(x, length / 2 - 0.08, 0.19, 0.12, z, z + 0.1, rubber);
  };
  const leaf = (base: Vec3, tip: Vec3, width: number, color: Color) => {
    const middle = mul(add(base, tip), 0.5);
    const side = mul(unit(cross(sub(tip, base), [0, 0, 1])), width);
    const ridge = add(middle, [0, 0, width * 0.48]);
    for (const edge of [sub(middle, side), add(middle, side)]) {
      const surface = unit(cross(sub(edge, base), sub(ridge, base)));
      const normal = surface[2] < 0 ? mul(surface, -1) : surface;
      for (const p of [base, edge, ridge]) vertex(opaque, p, normal, color);
      for (const p of [ridge, edge, tip]) vertex(opaque, p, normal, color);
    }
  };
  if (selected) {
    // A rounded outline also identifies floor bays and wooden fixtures,
    // which have no metal frame to highlight. Lift it above ground level.
    const outline: Vec3[] = [];
    for (let corner = 0; corner < 4; corner++) {
      const x = corner === 0 || corner === 3 ? 1.53 : -1.53;
      const y = corner < 2 ? 1.255 : -1.255;
      for (let step = 0; step <= 4; step++) {
        const angle = ((corner + step / 4) * Math.PI) / 2;
        outline.push([
          x + Math.cos(angle) * 0.13,
          y + Math.sin(angle) * 0.13,
          0.07,
        ]);
      }
    }
    outline.push(outline[0]);
    tube(outline, 0.04, accent, 8);
  }
  if (kind === 'stands') {
    for (const y of [-0.9, 0, 0.9]) {
      hoop(0, y, 1.14, 1.12);
      for (const x of [-0.57, 0.57]) flange(x, y, 0.102);
    }
  } else if (kind === 'post-hoop') {
    for (const x of [-1, 0, 1]) {
      line([x, 0, 0.028], [x, 0, 1.22], 0.075, frame);
      tube(
        [
          [x, 0, 1.18],
          [x, 0, 1.22],
          [x, 0, 1.24],
        ],
        [0.079, 0.081, 0.064],
        hardware,
        10,
      );
      ring(x, 0.058, 0.8, 0.335);
      for (const z of [0.47, 1.13]) {
        box(x, 0.046, 0.19, 0.112, z - 0.032, z + 0.031, frame);
        for (const dx of [-0.066, 0.066])
          box(x + dx, 0.104, 0.035, 0.019, z - 0.015, z + 0.015, steel);
      }
      flange(x, 0, 0.135);
    }
  } else if (kind === 'loops' || kind === 'safe-loops') {
    for (const x of [-1, 0, 1]) {
      // A narrow slot between two rails cradles the wheel.
      for (const side of [-1, 1]) {
        const rail = x + side * 0.061;
        tube(
          [
            [rail, -0.47, 0.05],
            [rail, -0.22, 0.29],
            [rail, -0.02, 0.46],
            [rail, 0.115, 0.48],
            [rail, 0.22, 0.41],
            [rail, 0.4, 0.05],
          ],
          0.025,
          steel,
          8,
        );
      }
      for (const y of [-0.47, 0.4]) {
        box(x, y, 0.26, 0.135, 0.012, 0.054, hardware);
        for (const dx of [-0.103, 0.103])
          box(x + dx, y, 0.031, 0.031, 0.053, 0.068, steel);
      }
      if (kind === 'safe-loops') {
        hoop(x + 0.3, 0, 0.94, 1.06, 0.038, true);
        for (const y of [-0.47, 0.47])
          box(x + 0.18, y, 0.37, 0.13, 0.013, 0.036, frame);
      }
    }
  } else if (kind === 'racks') {
    for (const [index, x] of [-1.15, -0.38, 0.38, 1.15].entries()) {
      hoop(x, 0, 0.92, index % 2 ? 0.66 : 0.88, 0.036, true);
      for (const y of [-0.46, 0.46])
        box(x, y, 0.135, 0.14, 0.058, 0.086, hardware);
    }
    for (const y of [-0.46, 0.46])
      box(0, y, 2.93, 0.118, 0.014, 0.064, hardware);
    for (const x of [-1.38, 1.38]) box(x, 0, 0.1, 1.0, 0.014, 0.055, frame);
  } else if (kind === 'two-tier') {
    for (const x of [-1.4, 1.4])
      for (const y of [-0.8, 0.8]) {
        box(x, y, 0.12, 0.12, 0.056, 1.74, frame);
        foot(x, y);
      }
    for (const z of [0.17, 1.4]) {
      for (const y of [-0.8, 0.8])
        box(0, y, 2.91, 0.1, z - 0.1, z + 0.01, frame);
      for (const x of [-0.92, 0, 0.92]) {
        channel(x, z);
        if (z > 1) {
          box(x, -0.46, 0.13, 0.96, z - 0.12, z - 0.02, hardware);
          for (const dx of [-0.12, 0.12])
            line([x + dx, -1, z + 0.04], [x + dx, -1.21, z + 0.04], 0.025);
          line(
            [x - 0.13, -1.21, z + 0.04],
            [x + 0.13, -1.21, z + 0.04],
            0.035,
            rubber,
          );
        }
        tube(
          [
            [x - 0.114, 0.69, z + 0.071],
            [x - 0.11, 0.79, z + 0.36],
            [x - 0.06, 0.85, z + 0.4],
            [x + 0.06, 0.85, z + 0.4],
            [x + 0.11, 0.79, z + 0.36],
            [x + 0.114, 0.69, z + 0.071],
          ],
          0.026,
          steel,
          8,
        );
        for (const dx of [-0.105, 0.105])
          box(x + dx, 0.69, 0.05, 0.14, z + 0.06, z + 0.092, hardware);
        if (z > 1) {
          line([x, 0.45, z - 0.11], [x, -0.46, z - 0.16], 0.032, frame);
          line([x, -0.46, z - 0.16], [x, -0.74, z - 0.11], 0.016, steel);
        }
      }
    }
  } else if (kind === 'vertical') {
    line([-1.35, 0.2, 0.13], [1.35, 0.2, 0.13], 0.06, frame);
    line([-1.35, 0.2, 1.68], [1.35, 0.2, 1.68], 0.05, frame);
    for (const x of [-1, 0, 1]) {
      box(x, 0.23, 0.15, 0.09, 0.06, 1.94, frame);
      box(x, 0.15, 0.15, 0.045, 0.2, 1.61, hardware);
      foot(x, 0.23);
      for (const side of [-1, 1]) {
        const rail = x + side * 0.1;
        box(rail, 0.135, 0.04, 0.1, 0.15, 1.84, hardware);
        line([rail, 0.085, 0.36], [rail, -0.315, 0.12], 0.021, steel);
      }
      tube(
        [
          [x, 0.18, 1.76],
          [x, -0.15, 1.76],
          [x, -0.25, 1.65],
          [x, -0.25, 1.56],
        ],
        0.035,
        rubber,
      );
      box(x, -0.23, 0.115, 0.96, 0.023, 0.093, frame);
      box(x, -0.37, 0.18, 0.25, 0.085, 0.125, rubber);
    }
  } else if (kind === 'wave') {
    const path: Vec3[] = [[-1.4, 0, 0.028]];
    for (let i = 0; i <= 5; i++) {
      const angle = Math.PI - (i * Math.PI) / 10;
      path.push([
        -1.18 + 0.22 * Math.cos(angle),
        0,
        0.97 + 0.22 * Math.sin(angle),
      ]);
    }
    for (let i = 1; i <= 40; i++) {
      const t = i / 40;
      path.push([-1.18 + t * 2.36, 0, 0.78 + 0.41 * Math.cos(t * Math.PI * 4)]);
    }
    for (let i = 1; i <= 5; i++) {
      const angle = Math.PI / 2 - (i * Math.PI) / 10;
      path.push([
        1.18 + 0.22 * Math.cos(angle),
        0,
        0.97 + 0.22 * Math.sin(angle),
      ]);
    }
    path.push([1.4, 0, 0.028]);
    tube(path, 0.055, steel);
    flange(-1.4, 0, 0.115);
    flange(1.4, 0, 0.115);
  } else if (kind === 'anchors') {
    for (const x of [-1, 0, 1]) {
      bevelBox(x, 0, 0.42, 0.31, 0.012, 0.058, hardware, 0.012);
      for (const dx of [-0.16, 0.16])
        box(x + dx, 0, 0.045, 0.045, 0.056, 0.081, steel);
      ring(x, 0, 0.198, 0.15, 0.043);
      for (const y of [-0.065, 0.065])
        box(x, y, 0.155, 0.07, 0.052, 0.121, frame);
    }
  } else if (kind === 'ground-slots' || kind === 'log') {
    if (kind === 'log') {
      // The saw cuts stop short of the bottom of a single, round timber beam.
      const axis = (x: number): Vec3 => [x, 0, 0.24];
      const bark: Color = [0.31, 0.22, 0.15, 1];
      const cut: Color = [0.56, 0.38, 0.23, 1];
      finishes.set(bark, 3);
      finishes.set(cut, 3);
      contact(0, 0, 3.08, 0.43);
      tube(
        [
          [-1.54, 0, 0.145],
          [1.54, 0, 0.145],
        ],
        0.137,
        bark,
        10,
      );
      for (const x of [-1.18, -0.39, 0.39, 1.18])
        tube([axis(x - 0.327), axis(x + 0.327)], [0.225, 0.232], bark, 12, cut);
    } else {
      const stone: Color = [0.51, 0.54, 0.5, 1];
      finishes.set(stone, 5);
      box(0, 0, 3.28, 1.1, 0.012, 0.067, stone);
      for (const x of [-1.275, -0.425, 0.425, 1.275])
        bevelBox(x, 0, 0.73, 1.1, 0.064, 0.16, stone, 0.037);
    }
  } else if (kind === 'handlebar') {
    for (const x of [-1, 0, 1]) {
      box(x, 0, 0.11, 0.11, 0.058, 1.46, frame);
      box(x, 0, 0.72, 0.085, 1.36, 1.44, steel);
      for (const side of [-1, 1]) {
        line([x, 0, 1.17], [x + side * 0.248, 0, 1.376], 0.027, hardware);
        tube(
          [
            [x + side * 0.3, -0.21, 1.52],
            [x + side * 0.3, -0.15, 1.4],
            [x + side * 0.3, 0.15, 1.4],
            [x + side * 0.3, 0.21, 1.52],
          ],
          0.035,
          rubber,
        );
      }
      foot(x, 0);
    }
  } else if (kind === 'saddle' || kind === 'a-frame') {
    for (const x of [-1.3, 1.3]) {
      tube(
        [
          [x, -0.7, 0.044],
          [x, 0, 1.23],
          [x, 0.7, 0.044],
        ],
        0.05,
        frame,
      );
      for (const y of [-0.7, 0.7])
        box(x, y, 0.16, 0.18, 0.012, 0.046, hardware);
      if (kind === 'a-frame') {
        box(x, 0, 0.07, 0.9, 0.46, 0.52, steel);
        box(x, 0, 0.16, 0.2, 1.16, 1.262, hardware);
      } else {
        for (const y of [-0.7, 0.7])
          box(x, y, 0.18, 0.185, 0.029, 0.057, rubber);
        line([x - 0.056, 0, 1.23], [x + 0.056, 0, 1.23], 0.091, trim);
      }
    }
    line([-1.5, 0, 1.23], [1.5, 0, 1.23], kind === 'saddle' ? 0.075 : 0.045);
    if (kind === 'saddle')
      for (const x of [-0.96, 0, 0.96])
        line([x - 0.13, 0, 1.23], [x + 0.13, 0, 1.23], 0.08, rubber);
  } else if (kind === 'rail') {
    for (const x of [-1.4, 0, 1.4]) {
      box(x, 0, 0.096, 0.096, 0.06, 1.17, frame);
      bevelBox(x, 0, 0.122, 0.122, 1.158, 1.208, trim, 0.018);
      foot(x, 0);
    }
    for (const z of [0.31, 1.05]) box(0, 0, 2.8, 0.064, z, z + 0.063, frame);
    for (const x of [-1.12, -0.84, -0.56, -0.28, 0.28, 0.56, 0.84, 1.12])
      box(x, 0, 0.035, 0.033, 0.35, 1.063, frame);
  } else if (kind === 'scissor') {
    for (const x of [-1, 0, 1]) {
      for (const side of [-1, 1])
        line(
          [x - side * 0.25, -0.32, 0.07],
          [x + side * 0.25, 0.32, 0.68],
          0.051,
        );
      box(x, 0, 0.52, 0.83, 0.012, 0.074, frame);
      line([x, -0.045, 0.375], [x, 0.045, 0.375], 0.077, hardware);
      for (const side of [-1, 1]) {
        box(x + side * 0.25, -0.32, 0.095, 0.1, 0.068, 0.122, trim);
        line(
          [x + side * 0.21, 0.28, 0.63],
          [x + side * 0.252, 0.322, 0.683],
          0.059,
          rubber,
        );
      }
    }
  } else if (kind === 'lockers') {
    const door: Color = [0.51, 0.57, 0.55, 1];
    finishes.set(door, 2);
    for (const x of [-1, 0, 1]) {
      box(x, 0, 0.82, 1.82, 0.012, 0.13, rubber);
      box(x, 0, 0.94, 1.95, 0.095, 1.28, body);
      bevelBox(x, 0, 0.974, 2.04, 1.27, 1.348, trim, 0.023);
      bevelBox(x, -0.996, 0.84, 0.045, 0.14, 1.2, door, 0.015);
      box(x, -1.02, 0.39, 0.018, 0.946, 1.171, trim);
      for (const z of [0.19, 1.003])
        box(x - 0.38, -1.018, 0.064, 0.04, z, z + 0.14, hardware);
      for (const z of [0.98, 1.055, 1.13])
        box(x, -1.028, 0.32, 0.013, z, z + 0.021, rubber);
      box(x + 0.29, -1.019, 0.106, 0.03, 0.61, 0.79, hardware);
      box(x + 0.23, -1.041, 0.19, 0.052, 0.71, 0.75, rubber);
      box(x + 0.292, -1.038, 0.037, 0.017, 0.637, 0.677, steel);
    }
  } else if (kind === 'streetpod') {
    for (const x of [-1, 0, 1]) {
      // Rounded shell encloses only the front wheel, leaving the frame outside.
      const spans = [
        [-0.1, 0.319, 0.515],
        [0.14, 0.348, 0.564],
        [0.57, 0.302, 0.5],
        [0.8, 0.236, 0.37],
      ];
      const steps = 14;
      const sections = spans.map(([y, width, height], section) =>
        Array.from({ length: steps + 1 }, (_, i) => {
          const a = (i * Math.PI) / steps;
          return {
            p: [
              x + Math.cos(a) * width,
              y,
              0.204 + Math.sin(a) * height,
            ] as Vec3,
            n: unit([
              Math.cos(a) / width,
              section < 2 ? -0.18 : 0.84,
              Math.sin(a) / height,
            ]),
          };
        }),
      );
      for (let section = 1; section < sections.length; section++) {
        const near = sections[section - 1],
          far = sections[section];
        for (let i = 0; i < steps; i++) {
          const strip = [near[i], far[i], far[i + 1], near[i + 1]];
          quad(
            opaque,
            strip.map(({ p }) => p),
            strip.map(({ n }) => n),
            body,
          );
        }
        for (const edge of [0, steps]) {
          const a = near[edge].p,
            b = far[edge].p;
          flatQuad(
            edge === 0
              ? [a, [a[0], a[1], 0.04], [b[0], b[1], 0.04], b]
              : [b, [b[0], b[1], 0.04], [a[0], a[1], 0.04], a],
            body,
          );
        }
      }
      const back = sections[sections.length - 1];
      for (let i = 0; i < steps; i++) {
        for (const p of [[x, 0.8, 0.204] as Vec3, back[i].p, back[i + 1].p])
          vertex(opaque, p, [0, 1, 0], body);
      }
      box(x, 0.79, 0.47, 0.02, 0.042, 0.205, body);
      tube(
        sections[0].map(({ p }) => p),
        0.031,
        trim,
        8,
      );
      box(x, 0.27, 0.76, 1.23, 0.012, 0.045, rubber);
      hoop(x, -0.42, 0.38, 1.05, 0.04);
      box(x, -0.42, 0.47, 0.14, 0.014, 0.044, hardware);
      channel(x, 0.04, 1.4);
      for (const y of [-0.29, 0.77])
        box(x, y, 0.145, 0.1, 0.042, 0.081, hardware);
    }
  } else if (kind === 'shed') {
    box(0, 0, 2.95, 2.26, 0.012, 0.105, trim);
    box(0, 0, 3, 2.3, 0.1, 1.84, body, -0.115);
    for (const x of [-1.4, -1.17, -0.94, 0.94, 1.17, 1.4])
      box(x, -1.15, 0.055, 0.047, 0.105, 1.95, trim);
    for (const x of [-1.49, 1.49])
      for (const y of [-0.88, -0.58, -0.29, 0, 0.29, 0.58, 0.88])
        box(x, y, 0.07, 0.049, 0.105, 1.83, trim, -0.115);
    box(0, -1.17, 1.42, 0.064, 0.09, 1.86, frame);
    for (const x of [-0.348, 0.348]) {
      box(x, -1.212, 0.665, 0.04, 0.11, 1.81, body);
      for (const z of [1.38, 1.47, 1.56])
        box(x, -1.236, 0.45, 0.025, z, z + 0.034, frame);
    }
    box(0.15, -1.249, 0.16, 0.052, 0.88, 0.93, steel);
    box(0, 0, 3.25, 2.55, 1.834, 1.95, trim, -0.115, -0.115);
    for (const x of [-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2])
      box(x, 0, 0.034, 2.48, 1.943, 1.98, hardware, -0.115, -0.115);
    box(0, 1.267, 3.25, 0.094, 1.78, 1.85, trim);
    tube(
      [
        [1.46, 1.265, 1.806],
        [1.46, 1.262, 1.684],
        [1.46, 1.188, 1.58],
        [1.46, 1.188, 0.135],
        [1.46, 1.254, 0.087],
      ],
      0.034,
      frame,
      8,
    );
    for (const x of [-1.23, -0.82, -0.41, 0, 0.41, 0.82, 1.23])
      box(x, 1.15, 0.048, 0.048, 0.106, 1.713, trim);
    for (const x of [-0.676, 0.676])
      for (const z of [0.31, 1.55])
        box(x, -1.238, 0.086, 0.037, z, z + 0.112, hardware);
  } else if (kind === 'bollard') {
    for (const x of [-1, 0, 1]) {
      tube(
        [
          [x, 0, 0.028],
          [x, 0, 1.08],
          [x, 0, 1.123],
          [x, 0, 1.143],
        ],
        [0.11, 0.11, 0.086, 0.055],
        body,
      );
      for (const z of [0.22, 1.002]) line([x, 0, z], [x, 0, z + 0.035], 0.114);
      line([x - 0.27, 0, 0.85], [x + 0.27, 0, 0.85], 0.061);
      for (const dx of [-0.141, 0.141])
        line([x + dx * 0.43, 0, 0.85], [x + dx, 0, 0.85], 0.079, trim);
      flange(x, 0, 0.15);
    }
  } else if (kind === 'floor') {
    const paint: Color = [0.89, 0.9, 0.84, 1];
    const paving: Color = [0.34, 0.35, 0.33, 1];
    finishes.set(paving, 5);
    box(0, 0, 2.9, 2.47, 0.002, 0.023, paving);
    const paintStroke = (a: Vec3, b: Vec3, halfWidth: number) => {
      const side = mul(unit(cross(sub(b, a), [0, 0, 1])), halfWidth);
      flatQuad([sub(a, side), add(a, side), add(b, side), sub(b, side)], paint);
    };
    const markZ = 0.027;
    for (const x of [-1.35, -0.45, 0.45, 1.35])
      paintStroke([x, -0.99, markZ], [x, 1.15, markZ], 0.029);
    paintStroke([-1.37, 1.15, markZ], [1.37, 1.15, markZ], 0.029);
    for (const x of [-0.9, 0, 0.9]) {
      for (const dx of [-0.17, 0.17]) {
        const circle = (i: number): Vec3 => {
          const angle = (i * Math.PI) / 8;
          return [
            x + dx + 0.1 * Math.cos(angle),
            0.64 + 0.1 * Math.sin(angle),
            markZ,
          ];
        };
        for (let i = 0; i < 16; i++)
          paintStroke(circle(i), circle(i + 1), 0.011);
      }
      const rear: Vec3 = [x - 0.17, 0.64, markZ],
        front: Vec3 = [x + 0.17, 0.64, markZ];
      const seat: Vec3 = [x - 0.089, 0.781, markZ],
        pedal: Vec3 = [x + 0.011, 0.64, markZ];
      const stem: Vec3 = [x + 0.106, 0.79, markZ];
      for (const [a, b] of [
        [rear, seat],
        [rear, pedal],
        [seat, pedal],
        [seat, stem],
        [pedal, stem],
        [stem, front],
      ])
        paintStroke(a, b, 0.012);
      paintStroke([x - 0.13, 0.799, markZ], [x - 0.055, 0.799, markZ], 0.012);
      paintStroke(stem, [x + 0.16, 0.831, markZ], 0.012);
    }
  } else if (kind === 'tree') {
    const bark: Color = [0.4, 0.3, 0.2, 1];
    finishes.set(bark, 4);
    const foliage: Color[] = [
      [0.28, 0.41, 0.2, 1],
      [0.34, 0.47, 0.224, 1],
      [0.37, 0.48, 0.25, 1],
    ];
    for (const color of foliage) finishes.set(color, 7);
    contact(-0.04, 0, 0.71, 0.62);
    tube(
      [
        [-0.045, 0, 0.01],
        [-0.045, 0, 0.3],
        [0, 0.04, 1.16],
        [0.14, 0.21, 2.04],
      ],
      [0.23, 0.16, 0.117, 0.029],
      bark,
      10,
    );
    for (const side of [-1, 1]) {
      tube(
        [
          [-0.04, 0, 0.18],
          [side * 0.17, -0.04, 0.097],
          [side * 0.34, -0.14, 0.024],
        ],
        [0.083, 0.055, 0.016],
        bark,
        8,
      );
      tube(
        [
          [0, 0.04, 1.08],
          [side * 0.36, 0.04, 1.49],
          [side * 0.73, 0.2, 1.89],
        ],
        [0.103, 0.067, 0.022],
        bark,
        8,
      );
      tube(
        [
          [0.03, 0.08, 1.27],
          [0.13, side * 0.29, 1.64],
          [-0.24, side * 0.51, 1.97],
        ],
        [0.075, 0.046, 0.02],
        bark,
        8,
      );
    }
    for (const [index, [x, y, z, size]] of [
      [-0.58, 0.12, 1.91, 0.44],
      [0.65, 0.1, 1.91, 0.43],
      [-0.24, -0.45, 2.02, 0.38],
      [-0.21, 0.54, 2.03, 0.4],
      [0.1, 0.15, 2.22, 0.51],
      [0.39, -0.29, 2.15, 0.36],
      [-0.41, 0.23, 2.14, 0.38],
      [0.08, 0.29, 2.43, 0.31],
    ].entries()) {
      tube(
        [
          [x, y, z - size * 0.68],
          [x, y, z - size * 0.25],
          [x - 0.04, y + 0.06, z + size * 0.24],
          [x + 0.02, y, z + size * 0.59],
        ],
        [0.08, size, size * 0.86, 0.13],
        foliage[index % foliage.length],
        8,
      );
    }
  }
  if (kind === 'planter') {
    const clay: Color = [0.54, 0.34, 0.245, 1];
    const soil: Color = [0.24, 0.2, 0.14, 1];
    finishes.set(clay, 5);
    finishes.set(soil, 5);
    const greenery: Color[] = [
      [0.29, 0.44, 0.21, 1],
      [0.4, 0.54, 0.27, 1],
    ];
    for (const color of greenery) finishes.set(color, 7);
    bevelBox(0, 0, 1.74, 1.24, 0.012, 0.71, clay, 0.042, 0.12);
    bevelBox(0, 0, 1.62, 1.11, 0.68, 0.724, soil, 0.018);
    for (const x of [-0.845, 0.845]) box(x, 0, 0.15, 1.36, 0.67, 0.78, clay);
    for (const y of [-0.61, 0.61]) box(0, y, 1.56, 0.137, 0.67, 0.78, clay);
    for (const [index, x] of [-0.53, 0.04, 0.47].entries()) {
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4 + index * 0.7;
        const reach = i % 2 === 0 ? 0.33 : 0.25;
        leaf(
          [x, 0, 0.72],
          [
            x + reach * Math.cos(a),
            reach * Math.sin(a),
            0.98 + ((i + index) % 5) * 0.073,
          ],
          0.078,
          greenery[i % 2],
        );
      }
    }
  } else if (kind === 'bench') {
    const wood: Color[] = [
      [0.53, 0.36, 0.24, 1],
      [0.57, 0.41, 0.28, 1],
    ];
    for (const color of wood) finishes.set(color, 3);
    for (const [index, y] of [-0.28, -0.09, 0.1, 0.29].entries())
      bevelBox(0, y, 2.4, 0.168, 0.49, 0.557, wood[index % 2], 0.014);
    for (const [index, z] of [0.76, 0.924, 1.088].entries())
      bevelBox(
        0,
        0.385 + index * 0.026,
        2.4,
        0.077,
        z,
        z + 0.14,
        wood[index % 2],
        0.012,
      );
    for (const x of [-0.9, 0.9]) {
      tube(
        [
          [x, 0.36, 0.034],
          [x, 0.36, 0.49],
          [x, 0.425, 0.71],
          [x, 0.478, 1.2],
        ],
        0.045,
        frame,
        8,
      );
      box(x, -0.25, 0.08, 0.078, 0.02, 0.5, frame);
      box(x, 0.05, 0.081, 0.68, 0.44, 0.499, frame);
      for (const y of [-0.25, 0.36])
        box(x, y, 0.157, 0.139, 0.012, 0.036, hardware);
    }
    for (const side of [-1, 1]) {
      hoop(side * 1.39, 0, 0.41, 0.8, 0.036);
      box(side * 1.39, 0, 0.5, 0.127, 0.012, 0.04, hardware);
      box(side * 1.15, 0, 0.165, 0.08, 0.455, 0.506, frame);
    }
  } else if (kind === 'lamp') {
    tube(
      [
        [0, 0, 0.03],
        [0, 0, 0.24],
        [0, 0, 2.03],
        [0.025, 0, 2.123],
        [0.093, 0, 2.198],
        [0.19, 0, 2.24],
        [0.61, 0, 2.24],
      ],
      [0.112, 0.098, 0.066, 0.057, 0.052, 0.049, 0.042],
      frame,
    );
    bevelBox(0.7, 0, 0.43, 0.259, 2.193, 2.285, trim, 0.028);
    bevelBox(0.745, 0, 0.292, 0.17, 2.176, 2.2, [0.83, 0.86, 0.8, 1], 0.01);
    box(0, -0.096, 0.084, 0.022, 0.18, 0.39, trim);
    flange(0, 0, 0.19);
  } else if (kind === 'dock') {
    for (const x of [-1, 0, 1]) {
      box(x, 0.35, 0.39, 0.36, 0.012, 0.06, hardware);
      bevelBox(x, 0.35, 0.237, 0.255, 0.057, 0.82, body, 0.018);
      bevelBox(x, 0.29, 0.357, 0.39, 0.66, 0.91, trim, 0.034);
      box(x, 0.084, 0.122, 0.05, 0.71, 0.812, rubber);
      for (const dx of [-0.08, 0.08])
        box(x + dx, 0.075, 0.057, 0.095, 0.702, 0.827, hardware);
      box(x + 0.084, 0.16, 0.042, 0.045, 0.907, 0.916, [0.47, 0.71, 0.48, 1]);
      channel(x, 0.028, 1.3);
      box(x, 0.56, 0.227, 0.102, 0.013, 0.062, frame);
    }
  }
  if (
    (covered || kind === 'shelter') &&
    kind !== 'shed' &&
    kind !== 'lockers'
  ) {
    const roof = (x: number) =>
      2.04 + (kind === 'tree' ? 0.26 : 0) + 0.5 * (1 - (x / 1.72) ** 2);
    const steps = 18;
    const glazing: Color = [0.69, 0.82, 0.87, 0.19];
    for (const y of [-1.32, 0, 1.32]) {
      const section = (i: number): Vec3[] => {
        const x = -1.72 + (i * 3.44) / steps;
        const z = roof(x);
        return [
          [x, y - 0.031, z - 0.057],
          [x, y + 0.031, z - 0.057],
          [x, y + 0.031, z - 0.01],
          [x, y - 0.031, z - 0.01],
        ];
      };
      for (let i = 0; i < steps; i++) {
        const a = section(i),
          b = section(i + 1);
        for (let side = 0; side < 4; side++) {
          const next = (side + 1) % 4;
          flatQuad([a[side], a[next], b[next], b[side]], frame);
        }
      }
      flatQuad(section(0).reverse(), frame);
      flatQuad(section(steps), frame);
      if (y === 0) continue;
      for (const x of [-1.6, 1.6]) {
        box(x, y, 0.105, 0.106, 0.055, roof(x) - 0.018, frame);
        foot(x, y);
        box(x, y, 0.16, 0.14, roof(x) - 0.137, roof(x) - 0.032, trim);
        line(
          [x, y, roof(x) - 0.19],
          [x - Math.sign(x) * 0.28, y, roof(x + Math.sign(-x) * 0.26) - 0.04],
          0.027,
          frame,
        );
      }
    }
    for (const x of [-1.72, 1.72])
      box(x, 0, 0.089, 2.82, roof(x) - 0.071, roof(x) + 0.018, trim);
    for (const x of [-0.86, 0.86])
      box(x, 0, 0.038, 2.78, roof(x) - 0.061, roof(x) - 0.018, steel);
    for (let i = 0; i < steps; i++) {
      const left = -1.72 + (i * 3.44) / steps,
        right = -1.72 + ((i + 1) * 3.44) / steps;
      const normal = (x: number): Vec3 => unit([x / 1.72 ** 2, 0, 1]);
      quad(
        glass,
        [
          [left, -1.4, roof(left)],
          [right, -1.4, roof(right)],
          [right, 1.4, roof(right)],
          [left, 1.4, roof(left)],
        ],
        [normal(left), normal(right), normal(right), normal(left)],
        glazing,
      );
    }
  }
  return {
    opaque: new Float32Array(opaque),
    glass: new Float32Array(glass),
    shadow: new Float32Array(shadow),
  };
}
