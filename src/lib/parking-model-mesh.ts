import type { ModelKind } from './parking-model-catalog';

export type Vec3 = [number, number, number];
type Color = [number, number, number, number];
export type ParkingMesh = { opaque: Float32Array; glass: Float32Array };
const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]) as Vec3;
const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3;
const mul = (a: Vec3, s: number): Vec3 => a.map((v) => v * s) as Vec3;
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
): ParkingMesh {
  const opaque: number[] = [],
    glass: number[] = [];
  // Use the app's mid-tone teal map accent (#14b8a6), retaining bare metal.
  const accent: Color = [20 / 255, 184 / 255, 166 / 255, 1];
  const steel: Color = [0.62, 0.71, 0.73, 1];
  const frame: Color = selected ? accent : [0.19, 0.31, 0.34, 1];
  const body: Color = selected ? accent : [0.2, 0.47, 0.45, 1];
  const vertex = (out: number[], p: Vec3, n: Vec3, color: Color) =>
    out.push(...p, ...n, ...color);
  const quad = (
    out: number[],
    points: Vec3[],
    normals: Vec3[],
    color: Color,
  ) => {
    for (const i of [0, 1, 2, 0, 2, 3])
      vertex(out, points[i], normals[i], color);
  };
  const box = (
    x: number,
    y: number,
    w: number,
    d: number,
    b: number,
    h: number,
    color: Color,
  ) => {
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
    for (const indices of [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ]) {
      const face = indices.map((i) => p[i]);
      const normal = unit(cross(sub(face[1], face[0]), sub(face[2], face[0])));
      quad(opaque, face, [normal, normal, normal, normal], color);
    }
  };
  const tube = (path: Vec3[], radius: number, color: Color) => {
    const sides = 16;
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
    const rings = path.map((p, i) => {
      const tangent = tangents[i];
      const side = unit(
        cross(tangent, Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]),
      );
      const up = cross(tangent, side);
      return Array.from({ length: sides }, (_, j) => {
        const angle = (j * Math.PI * 2) / sides;
        const normal = add(
          mul(side, Math.cos(angle)),
          mul(up, Math.sin(angle)),
        );
        return { p: add(p, mul(normal, radius)), n: normal };
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
        vertex(opaque, path[i], n, color);
        vertex(opaque, rings[i][j].p, n, color);
        vertex(opaque, rings[i][(j + 1) % sides].p, n, color);
      }
  };
  const hoop = (x: number, y: number, w: number, h: number, radius = 0.045) => {
    const path: Vec3[] = [[x - w / 2, y, 0.05]];
    // A continuous domed top joins two vertical legs, like a Sheffield stand.
    const rise = Math.min(w / 2, h * 0.46),
      shoulder = h - rise;
    path.push([x - w / 2, y, shoulder]);
    for (let i = 1; i <= 40; i++) {
      const angle = Math.PI - (i * Math.PI) / 40;
      path.push([
        x + (Math.cos(angle) * w) / 2,
        y,
        shoulder + Math.sin(angle) * rise,
      ]);
    }
    path.push([x + w / 2, y, 0.05]);
    tube(path, radius, steel);
    for (const end of [-1, 1])
      box(x + (end * w) / 2, y, 0.19, 0.16, 0.025, 0.055, frame);
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
      Array.from({ length: 65 }, (_, i): Vec3 => [
        x + Math.cos((i * Math.PI) / 32) * radius,
        y,
        z + Math.sin((i * Math.PI) / 32) * radius,
      ]),
      thickness,
      steel,
    );
  const foot = (x: number, y: number) =>
    box(x, y, 0.22, 0.22, 0.025, 0.07, frame);
  const channel = (x: number, z: number, length = 2.05) => {
    box(x, 0, 0.19, length, z, z + 0.045, steel);
    for (const side of [-1, 1])
      box(x + side * 0.11, 0, 0.035, length, z, z + 0.11, frame);
  };
  // A faint teal tint is blended into the opaque base, leaving glazing alone.
  const ground: Color = selected
    ? [0.66, 0.8, 0.775, 1]
    : [0.72, 0.79, 0.76, 1];
  box(0, 0, 3.4, 2.85, 0, 0.025, ground);
  if (selected) {
    // A rounded outline also identifies floor bays and wooden fixtures,
    // which have no metal frame to highlight. Lift it clear of the base slab.
    const outline: Vec3[] = [];
    for (let corner = 0; corner < 4; corner++) {
      const x = corner === 0 || corner === 3 ? 1.53 : -1.53;
      const y = corner < 2 ? 1.255 : -1.255;
      for (let step = 0; step <= 12; step++) {
        const angle = ((corner + step / 12) * Math.PI) / 2;
        outline.push([
          x + Math.cos(angle) * 0.13,
          y + Math.sin(angle) * 0.13,
          0.07,
        ]);
      }
    }
    outline.push(outline[0]);
    tube(outline, 0.04, accent);
  }
  if (kind === 'stands') for (const y of [-0.9, 0, 0.9]) hoop(0, y, 1.55, 1.12);
  else if (kind === 'post-hoop') {
    for (const x of [-1, 0, 1]) {
      line([x, 0, 0.06], [x, 0, 1.22], 0.065, frame);
      ring(x, 0, 0.8, 0.35);
      foot(x, 0);
    }
  } else if (kind === 'loops' || kind === 'safe-loops') {
    for (const x of [-1, 0, 1]) {
      // A narrow slot between two rails cradles the wheel.
      for (const side of [-1, 1])
        tube(
          [
            [x + side * 0.055, -0.48, 0.05],
            [x + side * 0.055, -0.1, 0.45],
            [x + side * 0.055, 0.18, 0.5],
            [x + side * 0.055, 0.4, 0.05],
          ],
          0.025,
          steel,
        );
      if (kind === 'safe-loops') hoop(x + 0.22, 0.2, 0.48, 1.1, 0.04);
    }
  } else if (kind === 'racks') {
    for (const x of [-1.15, -0.38, 0.38, 1.15]) hoop(x, 0, 0.42, 0.7, 0.035);
    for (const y of [-0.32, 0.32])
      line([-1.5, y, 0.08], [1.5, y, 0.08], 0.045, frame);
  } else if (kind === 'two-tier') {
    for (const x of [-1.4, 1.4])
      for (const y of [-0.8, 0.8]) {
        line([x, y, 0.06], [x, y, 1.72], 0.06, frame);
        foot(x, y);
      }
    for (const z of [0.17, 1.4]) {
      for (const y of [-0.8, 0.8]) line([-1.4, y, z], [1.4, y, z], 0.05, frame);
      for (const x of [-0.92, 0, 0.92]) {
        channel(x, z);
        tube(
          [
            [x - 0.12, -1.04, z + 0.03],
            [x - 0.12, -1.22, z + 0.03],
            [x + 0.12, -1.22, z + 0.03],
            [x + 0.12, -1.04, z + 0.03],
          ],
          0.025,
          steel,
        );
        ring(x, 0.75, z + 0.2, 0.17, 0.025);
      }
    }
  } else if (kind === 'vertical') {
    line([-1.35, 0.2, 0.13], [1.35, 0.2, 0.13], 0.06, frame);
    line([-1.35, 0.2, 1.68], [1.35, 0.2, 1.68], 0.05, frame);
    for (const x of [-1, 0, 1]) {
      box(x, 0.2, 0.16, 0.055, 0.08, 1.85, frame);
      for (const side of [-1, 1])
        line([x + side * 0.1, 0.16, 0.12], [x + side * 0.1, 0.16, 1.85], 0.025);
      tube(
        [
          [x, 0.18, 1.76],
          [x, -0.15, 1.76],
          [x, -0.25, 1.65],
          [x, -0.25, 1.57],
        ],
        0.035,
        steel,
      );
      line([x, 0.2, 0.08], [x, -0.7, 0.08], 0.065, frame);
    }
  } else if (kind === 'wave') {
    const path: Vec3[] = [[-1.4, 0, 0.06]];
    for (let i = 0; i <= 160; i++) {
      const t = i / 160;
      path.push([
        -1.4 + t * 2.8,
        0,
        0.28 + (1 - Math.cos(t * Math.PI * 6)) * 0.45,
      ]);
    }
    path.push([1.4, 0, 0.06]);
    tube(path, 0.055, steel);
    foot(-1.4, 0);
    foot(1.4, 0);
  } else if (kind === 'anchors') {
    for (const x of [-1, 0, 1]) {
      box(x, 0, 0.42, 0.35, 0.025, 0.085, frame);
      ring(x, 0, 0.2, 0.15, 0.04);
    }
  } else if (kind === 'ground-slots' || kind === 'log') {
    const timber: Color = [0.48, 0.31, 0.16, 1];
    const color = kind === 'log' ? timber : ([0.48, 0.55, 0.53, 1] as Color);
    // Leave real gaps through the beam for wheels.
    for (const x of [-1.275, -0.425, 0.425, 1.275])
      box(x, 0, 0.73, 1.1, 0.025, kind === 'log' ? 0.45 : 0.16, color);
  } else if (kind === 'handlebar') {
    for (const x of [-1, 0, 1]) {
      line([x, 0, 0.06], [x, 0, 1.4], 0.06, frame);
      line([x - 0.36, 0, 1.4], [x + 0.36, 0, 1.4]);
      for (const side of [-1, 1])
        tube(
          [
            [x + side * 0.3, -0.21, 1.52],
            [x + side * 0.3, -0.15, 1.4],
            [x + side * 0.3, 0.15, 1.4],
            [x + side * 0.3, 0.21, 1.52],
          ],
          0.035,
          steel,
        );
      foot(x, 0);
    }
  } else if (kind === 'saddle' || kind === 'a-frame') {
    for (const x of [-1.3, 1.3]) {
      tube(
        [
          [x, -0.7, 0.06],
          [x, 0, 1.23],
          [x, 0.7, 0.06],
        ],
        0.05,
        frame,
      );
      if (kind === 'a-frame') line([x, -0.43, 0.5], [x, 0.43, 0.5]);
    }
    line([-1.5, 0, 1.23], [1.5, 0, 1.23], kind === 'saddle' ? 0.075 : 0.045);
    if (kind === 'saddle')
      for (const x of [-0.9, 0, 0.9]) ring(x, 0, 1.21, 0.08, 0.02);
  } else if (kind === 'rail') {
    for (const x of [-1.4, 0, 1.4]) {
      line([x, 0, 0.06], [x, 0, 1.17], 0.05, frame);
      foot(x, 0);
    }
    for (const z of [0.48, 1.05]) line([-1.4, 0, z], [1.4, 0, z]);
  } else if (kind === 'scissor') {
    for (const x of [-1, 0, 1]) {
      for (const side of [-1, 1])
        line(
          [x - side * 0.25, -0.32, 0.07],
          [x + side * 0.25, 0.32, 0.68],
          0.04,
        );
      line([x, -0.4, 0.07], [x, 0.4, 0.07], 0.06, frame);
    }
  } else if (kind === 'lockers') {
    for (const x of [-1, 0, 1]) {
      box(x, 0, 0.92, 1.95, 0.025, 1.3, body);
      box(x, -0.985, 0.78, 0.035, 0.12, 1.2, [0.64, 0.75, 0.74, 1]);
      line([x + 0.22, -1.02, 0.58], [x + 0.22, -1.02, 0.75], 0.025, frame);
    }
  } else if (kind === 'streetpod') {
    for (const x of [-1, 0, 1]) {
      // Rounded shell encloses only the front wheel, leaving the frame outside.
      for (let i = 0; i < 40; i++) {
        const a = (i * Math.PI) / 40,
          b = ((i + 1) * Math.PI) / 40;
        const p = (angle: number, y: number): Vec3 => [
          x + Math.cos(angle) * 0.32,
          y,
          0.22 + Math.sin(angle) * 0.55,
        ];
        const n = (angle: number): Vec3 =>
          unit([Math.cos(angle) / 0.32, 0, Math.sin(angle) / 0.55]);
        quad(
          opaque,
          [p(a, -0.1), p(b, -0.1), p(b, 0.8), p(a, 0.8)],
          [n(a), n(b), n(b), n(a)],
          body,
        );
      }
      for (const side of [-1, 1])
        box(x + side * 0.3, 0.35, 0.04, 0.9, 0.025, 0.22, body);
      hoop(x, -0.25, 0.38, 1.05, 0.04);
      channel(x, 0.04, 1.4);
    }
  } else if (kind === 'shed') {
    box(0, 0, 3, 2.3, 0.025, 1.85, body);
    box(0, -1.17, 1.2, 0.04, 0.025, 1.65, frame);
    box(0, 0, 3.25, 2.55, 1.85, 1.96, [0.57, 0.68, 0.66, 1]);
  } else if (kind === 'bollard') {
    for (const x of [-1, 0, 1]) {
      line([x, 0, 0.06], [x, 0, 1.13], 0.12, body);
      line([x - 0.27, 0, 0.85], [x + 0.27, 0, 0.85], 0.06);
      foot(x, 0);
    }
  } else if (kind === 'floor') {
    const paint: Color = [0.94, 0.96, 0.92, 1];
    for (const x of [-1.35, -0.45, 0.45, 1.35])
      box(x, 0, 0.045, 2.3, 0.026, 0.03, paint);
    for (const y of [-1.15, 1.15]) box(0, y, 2.7, 0.045, 0.026, 0.03, paint);
  } else if (kind === 'tree') {
    const bark: Color = [0.4, 0.3, 0.2, 1];
    line([0, 0, 0.06], [0, 0, 1.8], 0.2, bark);
    for (const side of [-1, 1])
      line([0, 0, 1], [side * 0.7, 0, 1.85], 0.1, bark);
    for (const side of [-1, 1])
      line([0, 0, 1.4], [0, side * 0.55, 1.95], 0.07, bark);
  }
  if (kind === 'planter') {
    const clay: Color = [0.53, 0.36, 0.24, 1];
    box(0, 0, 1.75, 1.25, 0.025, 0.72, clay);
    box(0, 0, 1.85, 1.35, 0.65, 0.78, clay);
    box(0, 0, 1.55, 1.05, 0.78, 0.8, [0.24, 0.2, 0.14, 1]);
    for (const x of [-0.5, 0, 0.5]) {
      line([x, 0, 0.8], [x, 0, 1.25], 0.025, body);
      for (const side of [-1, 1])
        line([x, 0, 0.96], [x + side * 0.2, side * 0.12, 1.17], 0.06, body);
    }
  } else if (kind === 'bench') {
    const wood: Color = [0.53, 0.36, 0.24, 1];
    for (const y of [-0.25, 0, 0.25]) box(0, y, 2.4, 0.2, 0.49, 0.56, wood);
    for (const z of [0.78, 1.03]) box(0, 0.38, 2.4, 0.1, z, z + 0.18, wood);
    for (const x of [-0.9, 0.9]) {
      line([x, 0.38, 0.06], [x, 0.38, 1.2], 0.045, frame);
      line([x, -0.25, 0.06], [x, -0.25, 0.5], 0.045, frame);
    }
    for (const x of [-1.35, 1.35]) hoop(x, 0, 0.42, 0.8, 0.04);
  } else if (kind === 'lamp') {
    line([0, 0, 0.06], [0, 0, 1.85], 0.08, frame);
    line([0, 0, 1.85], [0.65, 0, 1.85], 0.055, frame);
    box(0.65, 0, 0.48, 0.24, 1.76, 1.87, steel);
    foot(0, 0);
  } else if (kind === 'dock') {
    for (const x of [-1, 0, 1]) {
      box(x, 0.35, 0.28, 0.28, 0.025, 0.9, body);
      box(x, 0.18, 0.36, 0.15, 0.64, 0.8, frame);
      channel(x, 0.04, 1.3);
    }
  }
  if (
    (covered || kind === 'shelter') &&
    kind !== 'shed' &&
    kind !== 'lockers'
  ) {
    const roof = (x: number) => 2.04 + 0.5 * (1 - (x / 1.72) ** 2);
    const steps = 64;
    for (const y of [-1.32, 1.32]) {
      const arch: Vec3[] = Array.from({ length: steps + 1 }, (_, i) => {
        const x = -1.72 + (i * 3.44) / steps;
        return [x, y, roof(x)];
      });
      tube(arch, 0.04, frame);
      for (const x of [-1.6, 1.6]) {
        tube(
          [
            [x, y, 0.03],
            [x, y, roof(x)],
          ],
          0.045,
          frame,
        );
        box(x, y, 0.2, 0.2, 0.025, 0.06, frame);
      }
    }
    for (const x of [-1.72, 0, 1.72])
      tube(
        [
          [x, -1.38, roof(x)],
          [x, 1.38, roof(x)],
        ],
        0.025,
        frame,
      );
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
        [0.67, 0.86, 0.89, 0.26],
      );
    }
  }
  return { opaque: new Float32Array(opaque), glass: new Float32Array(glass) };
}
