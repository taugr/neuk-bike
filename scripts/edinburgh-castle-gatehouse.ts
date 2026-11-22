import type { AddFace, Point, Stone } from './edinburgh-castle-geometry';

/** Gatehouse local axes follow the mapped passage. Heights are relative to its threshold. */
export function appendGatehouse(add: AddFace, depth: number) {
  const front = -0.15;
  const radius = 2.25;
  const spring = 2.28;
  const wingTop = 6.7;
  const eave = 8.05;
  const crest = 11.75;
  const ridge = 14.65;
  const half = 6.1;
  const niche = 3.78;
  const nicheHalf = 0.44;
  const nicheFoot = 0.9;
  const nicheHead = 3.92;

  const face = (
    a: number,
    b: number,
    d: number,
    al: number,
    bl: number,
    ah: number,
    bh: number,
    stone: Stone = 'sandstone',
    rear = false,
  ) => {
    if (b <= a || Math.max(ah - al, bh - bl) < 0.003) return;
    const corners = [
      [a, d, al],
      [b, d, bl],
      [b, d, bh],
      [a, d, ah],
    ] as const;
    add(
      rear ? [corners[3], corners[2], corners[1], corners[0]] : corners,
      stone,
    );
  };
  const box = (
    from: number,
    to: number,
    near: number,
    far: number,
    bottom: number,
    top: number,
    stone: Stone,
    heightAtDepth?: (depth: number) => number,
  ) => {
    const ring = [
      [from, near],
      [to, near],
      [to, far],
      [from, far],
    ];
    const point = (i: number, z: number): Point => {
      const [x, y] = ring[i];
      return [x, y, z + (heightAtDepth?.(y) ?? 0)];
    };
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      add(
        [
          point(i, bottom),
          point(next, bottom),
          point(next, top),
          point(i, top),
        ],
        stone,
      );
    }
    add([point(0, top), point(1, top), point(2, top), point(3, top)], stone);
    add(
      [point(3, bottom), point(2, bottom), point(1, bottom), point(0, bottom)],
      stone,
    );
  };
  const arch = (x: number) =>
    spring + Math.sqrt(Math.max(0, radius * radius - x * x));
  const u = Array.from(
    { length: 17 },
    (_, i) => -radius * Math.cos((i * Math.PI) / 16),
  );
  for (let i = 1; i < u.length; i++) {
    const a = u[i - 1];
    const b = u[i];
    face(a, b, front, arch(a), arch(b), crest, crest);
    face(a, b, depth, arch(a), arch(b), eave, eave, 'sandstone', true);
    add(
      [
        [a, front, arch(a)],
        [b, front, arch(b)],
        [b, depth, arch(b)],
        [a, depth, arch(a)],
      ],
      'shadow',
    );
  }
  add(
    [
      [-radius, front, 0],
      [-radius, front, spring],
      [-radius, depth, spring],
      [-radius, depth, 0],
    ],
    'paving',
  );
  add(
    [
      [radius, depth, 0],
      [radius, depth, spring],
      [radius, front, spring],
      [radius, front, 0],
    ],
    'paving',
  );

  // Turned stone voussoirs, each with a real soffit and a recessed mortar joint.
  for (let i = 0; i < 15; i++) {
    const a = (Math.PI * i) / 15 + 0.006;
    const b = (Math.PI * (i + 1)) / 15 - 0.006;
    const outer = radius + (i === 7 ? 0.51 : 0.4);
    const point = (angle: number, r: number, d: number): Point => [
      r * Math.cos(angle),
      d,
      spring + r * Math.sin(angle),
    ];
    const lead = front - 0.23;
    add(
      [
        point(b, radius, lead),
        point(a, radius, lead),
        point(a, outer, lead),
        point(b, outer, lead),
      ],
      'dressing',
    );
    add(
      [
        point(a, radius, lead),
        point(b, radius, lead),
        point(b, radius, front),
        point(a, radius, front),
      ],
      'paving',
    );
    add(
      [
        point(b, outer, lead),
        point(a, outer, lead),
        point(a, outer, front),
        point(b, outer, front),
      ],
      'dressing',
    );
  }
  box(-radius - 0.42, -radius, front - 0.23, front, -0.1, spring, 'dressing');
  box(radius, radius + 0.42, front - 0.23, front, -0.1, spring, 'dressing');

  for (const side of [-1, 1]) {
    const lo = Math.min(side * half, side * radius);
    const hi = Math.max(side * half, side * radius);
    const n = side * niche;
    const l = n - nicheHalf;
    const r = n + nicheHalf;
    const recess = front + 0.42;
    face(lo, l, front, -2.8, -2.8, crest, crest);
    face(r, hi, front, -2.8, -2.8, crest, crest);
    face(l, r, front, -2.8, -2.8, nicheFoot, nicheFoot);
    face(l, r, front, nicheHead, nicheHead, crest, crest);
    face(l, r, recess, nicheFoot, nicheFoot, nicheHead, nicheHead, 'shadow');
    add(
      [
        [l, front, nicheFoot],
        [l, recess, nicheFoot],
        [l, recess, nicheHead],
        [l, front, nicheHead],
      ],
      'paving',
    );
    add(
      [
        [r, recess, nicheFoot],
        [r, front, nicheFoot],
        [r, front, nicheHead],
        [r, recess, nicheHead],
      ],
      'paving',
    );
    box(
      l - 0.14,
      r + 0.14,
      front - 0.21,
      recess,
      nicheFoot - 0.1,
      nicheFoot,
      'dressing',
    );
    box(l - 0.11, l, front - 0.15, front, nicheFoot, nicheHead, 'dressing');
    box(r, r + 0.11, front - 0.15, front, nicheFoot, nicheHead, 'dressing');
    add(
      [
        [l - 0.16, front - 0.16, nicheHead],
        [r + 0.16, front - 0.16, nicheHead],
        [n, front - 0.12, nicheHead + 0.49],
      ],
      'dressing',
    );
    // A bronze silhouette gives the historical statue niches depth at map scale.
    box(
      n - 0.2,
      n + 0.2,
      front + 0.05,
      recess,
      nicheFoot + 0.22,
      nicheHead - 0.57,
      'bronze',
    );
    box(
      n - 0.13,
      n + 0.13,
      front + 0.08,
      recess,
      nicheHead - 0.58,
      nicheHead - 0.24,
      'bronze',
    );
    face(lo, hi, depth, -2.7, -2.7, eave, eave, 'sandstone', true);
    const outer = side * half;
    const sideFace = [
      [outer, front, -2.7],
      [outer, depth, -2.7],
      [outer, depth, eave],
      [outer, front, eave],
    ] as const;
    add(
      side < 0
        ? [sideFace[3], sideFace[2], sideFace[1], sideFace[0]]
        : sideFace,
      'sandstone',
    );
  }

  const wings = [
    [-20.55, -half, -0.1, 9.25],
    [half, 10.38, 0.14, 10.15],
    [10.37, 13.65, 3.88, 10.4],
  ];
  for (const [start, end, near, far] of wings) {
    box(start, end, near, far, -4.7, wingTop - 0.6, 'sandstone');
    box(
      start,
      end,
      near - 0.1,
      near + 0.58,
      wingTop - 0.63,
      wingTop,
      'sandstone',
    );
    box(
      start - 0.09,
      end + 0.09,
      near - 0.22,
      near + 0.71,
      wingTop - 0.08,
      wingTop + 0.17,
      'dressing',
    );
    for (let n = start + 0.36; n < end - 0.34; n += 0.78)
      box(
        n,
        n + 0.24,
        near - 0.2,
        near,
        wingTop - 1.08,
        wingTop - 0.58,
        'dressing',
      );
    for (let n = start + 2.0; n < end - 0.5; n += 3.15)
      face(n, n + 0.23, near - 0.027, 2, 2, 3.12, 3.12, 'shadow');
  }

  const beam = front - 0.24;
  box(-half, half, beam, front + 0.56, crest - 0.94, crest - 0.68, 'dressing');
  box(-half, half, beam, front + 0.57, crest - 0.15, crest + 0.09, 'dressing');
  for (let x = -half + 0.24; x < half - 0.35; x += 0.92)
    box(x, x + 0.3, beam, front, crest - 1.3, crest - 0.84, 'dressing');
  for (let x = -half + 0.02; x < half - 0.63; x += 1.72) {
    box(
      x,
      x + 0.83,
      front - 0.08,
      front + 0.58,
      crest,
      crest + 0.68,
      'sandstone',
    );
    box(
      x - 0.055,
      x + 0.89,
      front - 0.15,
      front + 0.64,
      crest + 0.62,
      crest + 0.78,
      'dressing',
    );
  }

  // The ridge runs along the passage. The rear gable rises above the slate.
  const roofNear = front + 0.58;
  const roofBack = depth - 0.18;
  add(
    [
      [-half, roofNear, eave],
      [0, roofNear, ridge],
      [0, roofBack, ridge],
      [-half, roofBack, eave],
    ],
    'slate',
  );
  add(
    [
      [0, roofNear, ridge],
      [half, roofNear, eave],
      [half, roofBack, eave],
      [0, roofBack, ridge],
    ],
    'slate',
  );
  for (let step = 0; step < 6; step++) {
    const width = half - step * 1.04;
    const low = eave + (step * (ridge - eave)) / 6;
    const top = eave + ((step + 1) * (ridge - eave)) / 6;
    box(-width, width, roofBack, depth + 0.09, low - 0.06, top, 'sandstone');
    box(
      -width - 0.09,
      -width + 0.94,
      roofBack - 0.08,
      depth + 0.18,
      top - 0.12,
      top + 0.14,
      'dressing',
    );
    box(
      width - 0.94,
      width + 0.09,
      roofBack - 0.08,
      depth + 0.18,
      top - 0.12,
      top + 0.14,
      'dressing',
    );
  }
  face(-0.77, 0.77, depth + 0.102, 6.27, 6.27, 8.08, 8.08, 'shadow', true);
  box(-0.28, 0.28, depth + 0.095, depth + 0.25, 6.3, 8.04, 'dressing');
  box(-0.91, 0.91, depth + 0.05, depth + 0.32, 6.15, 6.31, 'dressing');

  for (const x of [-half + 0.25, half - 0.25]) {
    // Short corbelled bartizans at the front corners.
    const round = (i: number, radius: number, z: number): Point => {
      const angle = (i * 2 * Math.PI) / 14;
      return [
        x + Math.cos(angle) * radius,
        front + Math.sin(angle) * radius,
        z,
      ];
    };
    for (let i = 0; i < 14; i++) {
      const j = i + 1;
      add(
        [
          round(i, 0.38, crest - 2.2),
          round(j, 0.38, crest - 2.2),
          round(j, 1.05, crest - 0.18),
          round(i, 1.05, crest - 0.18),
        ],
        'sandstone',
      );
      add(
        [
          round(i, 1.05, crest - 0.18),
          round(j, 1.05, crest - 0.18),
          round(j, 1.07, crest + 0.95),
          round(i, 1.07, crest + 0.95),
        ],
        'sandstone',
      );
      add(
        [
          round(i, 1.07, crest + 0.95),
          round(j, 1.07, crest + 0.95),
          [x, front, crest + 0.95],
        ],
        'dressing',
      );
      if (i % 2 === 0)
        add(
          [
            round(i, 1.08, crest + 0.89),
            round(j, 1.08, crest + 0.89),
            round(j, 1.08, crest + 1.3),
            round(i, 1.08, crest + 1.3),
          ],
          'dressing',
        );
    }
  }
  // Heraldic panel above the arch. The shield and stone frame catch separate light.
  box(-1.17, -0.94, front - 0.22, front, 5.28, 7.46, 'dressing');
  box(0.94, 1.17, front - 0.22, front, 5.28, 7.46, 'dressing');
  box(-0.94, 0.94, front - 0.22, front, 5.28, 5.48, 'dressing');
  box(-0.94, 0.94, front - 0.22, front, 7.26, 7.46, 'dressing');
  face(-0.94, 0.94, front - 0.07, 5.48, 5.48, 7.26, 7.26, 'shadow');
  const shield = front - 0.15;
  add(
    [
      [-0.33, shield, 6.05],
      [0, shield, 5.71],
      [0.33, shield, 6.05],
    ],
    'sandstone',
  );
  face(-0.33, 0.33, shield, 6.05, 6.05, 6.89, 6.89, 'sandstone');

  // Bridge deck over the dry ditch and the shaded floor through the pend.
  const approach = (d: number) => Math.min(0, (d - front) * 0.047);
  box(-2.69, 2.69, -10.7, front, -0.32, 0.025, 'paving', approach);
  box(-2.69, 2.69, front, depth, -0.32, 0.025, 'paving');
  for (const side of [-1, 1]) {
    const start = side * 2.66 - 0.12;
    box(start, start + 0.24, -10.7, front, 0.02, 0.64, 'paving', approach);
    box(
      start - 0.04,
      start + 0.28,
      -10.7,
      front,
      0.61,
      0.73,
      'dressing',
      approach,
    );
  }
}
