import {
  MercatorCoordinate,
  type Map as LibreMap,
  type CustomLayerInterface,
} from 'maplibre-gl';
import { rainAt, rainStrength, type RainSnapshot } from './rain';

type Point = { x: number; y: number };
type Drop = {
  longitude: number;
  latitude: number;
  ground: MercatorCoordinate;
  top: MercatorCoordinate;
  strength: number;
  chance: number;
  phase: number;
  speed: number;
};
const random = (seed: number) => {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};

// Adapted from Trail Atlas's terrain-projected rain. All particle positions are
// geographic; the separate canvas never intercepts map/marker interactions.
export function createRainRenderer(map: LibreMap, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let snapshot: RainSnapshot | null = null;
  let drops: Drop[] = [];
  let activeDrops = 0;
  let matrix: number[] = [];
  let width = 0,
    height = 0,
    seed = 0,
    raf = 0,
    lastDraw = 0;
  let dirty = true,
    disposed = false;
  const layer: CustomLayerInterface = {
    id: 'neuk-rain-projection',
    type: 'custom',
    renderingMode: '3d',
    render(_gl, args) {
      const nextMatrix = Array.from(args.defaultProjectionData.mainMatrix);
      // Refill newly exposed areas on each camera frame, not just moveend.
      // Rebuild only after receiving the matrix matching map.unproject().
      if (nextMatrix.some((value, i) => value !== matrix[i])) dirty = true;
      matrix = nextMatrix;
      draw(performance.now());
      if (!raf && !document.hidden && !motion.matches && activeDrops)
        raf = requestAnimationFrame(tick);
    },
  };
  function project(p: MercatorCoordinate): Point | null {
    if (!matrix.length) return null;
    const m = matrix,
      w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
    if (w <= 0) return null;
    const z = (m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14]) / w;
    if (z < -1 || z > 1) return null;
    return {
      x: (((m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12]) / w + 1) * width) / 2,
      y:
        ((1 - (m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13]) / w) * height) / 2,
    };
  }
  function anchor(longitude: number, latitude: number, elevation: number) {
    // A flat map's ground is sea level in Mercator space. Using model elevation
    // there would lift rain off its anchors, particularly in high-altitude cities.
    const ground = map.getTerrain()
      ? (map.queryTerrainElevation([longitude, latitude]) ?? elevation)
      : 0;
    const metresPerPixel =
      (40075016 * Math.cos((latitude * Math.PI) / 180)) /
      (512 * 2 ** map.getZoom());
    const lift = Math.min(12000, Math.max(100, metresPerPixel * 120));
    return {
      ground: MercatorCoordinate.fromLngLat([longitude, latitude], ground),
      top: MercatorCoordinate.fromLngLat([longitude, latitude], ground + lift),
    };
  }
  function rebuild() {
    dirty = false;
    if (!snapshot) {
      drops = [];
      activeDrops = 0;
      return;
    }
    const occupied = new Map<string, number>();
    drops = drops.filter((d) => {
      const p = project(d.ground),
        rain = rainAt(snapshot!, d.longitude, d.latitude);
      if (
        !p ||
        p.x < -width * 0.2 ||
        p.x > width * 1.2 ||
        p.y < -height * 0.2 ||
        p.y > height * 1.2
      )
        return false;
      const cell = `${Math.floor(p.x / 45)},${Math.floor(p.y / 45)}`;
      const count = occupied.get(cell) ?? 0;
      if (count >= 5) return false;
      occupied.set(cell, count + 1);
      const strength = rain ? rainStrength(rain.rate) : 0;
      d.strength = d.chance <= strength ? strength : 0;
      Object.assign(d, anchor(d.longitude, d.latitude, rain?.elevation ?? 0));
      return true;
    });
    const limit = width < 700 ? 450 : 1000;
    const target = Math.min(limit, Math.round((width * height) / 850));
    for (let i = drops.length; i < target; i++) {
      const id = seed++;
      const sx = (random(id * 7 + 1) * 1.4 - 0.2) * width;
      const sy = (random(id * 7 + 2) * 1.4 - 0.2) * height;
      const point = map.unproject([sx, sy]);
      const rain = rainAt(snapshot, point.lng, point.lat);
      const strength = rain ? rainStrength(rain.rate) : 0;
      const chance = random(id * 7 + 3);
      // Retain invisible candidates too: repeated pans must not progressively
      // turn light rain into heavy rain by rerolling the same density budget.
      drops.push({
        longitude: point.lng,
        latitude: point.lat,
        ...anchor(point.lng, point.lat, rain?.elevation ?? 0),
        strength: chance <= strength ? strength : 0,
        chance,
        phase: random(id * 7 + 4),
        speed: 0.55 + random(id * 7 + 5) * 0.4,
      });
    }
    activeDrops = drops.filter((d) => d.strength > 0).length;
    canvas.dataset.rainParticles = String(activeDrops);
  }
  function draw(now: number) {
    if (!ctx || disposed || document.hidden) return;
    const container = map.getContainer(),
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    if (width !== container.clientWidth || height !== container.clientHeight) {
      width = container.clientWidth;
      height = container.clientHeight;
      dirty = true;
    }
    if (
      canvas.width !== Math.round(width * dpr) ||
      canvas.height !== Math.round(height * dpr)
    ) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!snapshot || !matrix.length) return;
    if (dirty) rebuild();
    const time = motion.matches ? 0 : now / 1000;
    canvas.dataset.motion = motion.matches ? 'static' : 'animated';
    ctx.lineCap = 'round';
    for (const d of drops) {
      if (!d.strength) continue;
      const ground = project(d.ground);
      if (!ground) continue;
      const top = project(d.top) ?? { x: ground.x, y: ground.y - height * 0.5 };
      if (map.getPitch() < 12) {
        top.x = ground.x + 8;
        top.y = ground.y - 85;
      }
      let dx = ground.x - top.x,
        dy = ground.y - top.y;
      let span = Math.hypot(dx, dy);
      // At country scale a physical cloud height projects to only a few pixels.
      // Keep this illustrative effect legible without moving its ground anchor.
      if (span < 60) {
        const scale = 60 / Math.max(0.001, span);
        dx = span < 0.001 ? 0 : dx * scale;
        dy = span < 0.001 ? 60 : dy * scale;
        top.x = ground.x - dx;
        top.y = ground.y - dy;
        span = 60;
      }
      if (span > height * 0.65) {
        const scale = (height * 0.65) / span;
        top.x = ground.x - dx * scale;
        top.y = ground.y - dy * scale;
        dx = ground.x - top.x;
        dy = ground.y - top.y;
      }
      const progress = (d.phase + time * d.speed) % 1;
      const x = top.x + dx * progress,
        y = top.y + dy * progress;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const length = Math.min(distance * progress, 6 + d.strength * 11);
      const fade = Math.min(1, progress * 6, (1 - progress) * 8);
      // Deep blue halo and bright blue centre stay legible on streets/satellite.
      ctx.globalAlpha = fade * (0.3 + d.strength * 0.4);
      ctx.beginPath();
      ctx.moveTo(x - (dx / distance) * length, y - (dy / distance) * length);
      ctx.lineTo(x, y);
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = '#1d4ed8';
      ctx.stroke();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function tick(now: number) {
    raf = 0;
    if (disposed || document.hidden || motion.matches || !snapshot) return;
    if (now - lastDraw >= 33) {
      draw(now);
      lastDraw = now;
    }
    if (activeDrops) raf = requestAnimationFrame(tick);
  }
  const start = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    draw(performance.now());
    if (!document.hidden && !motion.matches && snapshot && activeDrops)
      raf = requestAnimationFrame(tick);
  };
  const settled = () => {
    dirty = true;
    start();
  };
  const attach = () => {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
    dirty = true;
    map.triggerRepaint();
    start();
  };
  map.on('style.load', attach);
  map.on('moveend', settled);
  map.on('resize', settled);
  map.on('terrain', settled);
  document.addEventListener('visibilitychange', start);
  motion.addEventListener('change', start);
  attach();
  return {
    update(next: RainSnapshot) {
      snapshot = next;
      // Preserve geographic anchors and animation phases across fresh data.
      dirty = true;
      map.triggerRepaint();
      start();
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(raf);
      map.off('style.load', attach);
      map.off('moveend', settled);
      map.off('resize', settled);
      map.off('terrain', settled);
      document.removeEventListener('visibilitychange', start);
      motion.removeEventListener('change', start);
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
