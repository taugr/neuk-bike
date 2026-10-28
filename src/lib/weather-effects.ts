type Point = { x: number; y: number };
const noise = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/** Stable geometry for one discharge: branches grow out of the main channel. */
export function lightningPaths(seed: number, length: number): Point[][] {
  const main: Point[] = [{ x: 0, y: 0 }];
  for (let i = 1; i <= 24; i++) {
    main.push({
      x:
        Math.sin(i * 0.67 + seed) * length * 0.065 +
        (noise(seed * 31 + i) - 0.5) * length * 0.12,
      y: (i / 24) * length,
    });
  }
  const paths = [main];
  for (const index of [5, 9, 13, 17]) {
    const root = main[index];
    const direction = noise(seed + index) > 0.5 ? 1 : -1;
    const branch = [root];
    for (let i = 1; i <= 7; i++) {
      branch.push({
        x:
          root.x +
          direction * length * i * 0.027 +
          (noise(seed + index * 13 + i) - 0.5) * length * 0.045,
        y: root.y + length * i * 0.022,
      });
    }
    paths.push(branch);
  }
  return paths;
}

export function drawLightning(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  seed: number,
  opacity: number,
) {
  const length = 135 + noise(seed) * 65;
  const paths = lightningPaths(seed, length);
  ctx.save();
  ctx.translate(x, y - length);
  ctx.lineJoin = 'round';
  // Local, translucent blue-violet glow with a very narrow white-hot core.
  for (const [width, alpha, color] of [
    [12, 0.07, '#818cf8'],
    [6, 0.18, '#93c5fd'],
    [2.5, 0.6, '#c7d2fe'],
    [1, 1, '#ffffff'],
  ] as const) {
    paths.forEach((path, index) => {
      ctx.globalAlpha = opacity * alpha * (index ? 0.55 : 1);
      ctx.strokeStyle = color;
      ctx.lineWidth = width * (index ? 0.55 : 1);
      ctx.beginPath();
      path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    });
  }
  ctx.restore();
}

export function drawSnowflake(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  depth: number,
  rotation: number,
  opacity: number,
) {
  const radius = 0.8 + depth * 3.2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = opacity * (0.5 + depth * 0.45);
  if (depth < 0.78) {
    // Distant flakes are soft filled specks, never hollow outlined circles.
    ctx.fillStyle = 'rgba(100, 140, 175, 0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fcff';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // A few nearer six-armed crystals tumble among the smaller flakes.
    ctx.beginPath();
    for (let arm = 0; arm < 6; arm++) {
      const angle = (arm * Math.PI) / 3;
      const c = Math.cos(angle),
        s = Math.sin(angle);
      ctx.moveTo(0, 0);
      ctx.lineTo(c * radius, s * radius);
      for (const side of [-1, 1]) {
        ctx.moveTo(c * radius * 0.58, s * radius * 0.58);
        ctx.lineTo(
          c * radius * 0.32 - s * side * radius * 0.25,
          s * radius * 0.32 + c * side * radius * 0.25,
        );
      }
    }
    ctx.strokeStyle = 'rgba(71, 105, 140, 0.25)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.strokeStyle = '#f8fcff';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawFog(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  phase: number,
  time: number,
) {
  ctx.save();
  ctx.translate(
    x + Math.sin(time * 0.13 + phase * 10) * 24,
    y + Math.sin(time * 0.09 + phase * 8) * 8,
  );
  ctx.scale(1, 0.42 + phase * 0.18);
  const radius = 110 + phase * 80;
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0, 'rgba(226, 233, 239, 0.3)');
  gradient.addColorStop(0.45, 'rgba(226, 233, 239, 0.18)');
  gradient.addColorStop(1, 'rgba(226, 233, 239, 0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = gradient;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  ctx.restore();
}
