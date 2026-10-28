import {
  MercatorCoordinate,
  type Map as LibreMap,
  type CustomLayerInterface,
} from 'maplibre-gl';
import {
  rainAt,
  rainStrength,
  isThunderstorm,
  isHail,
  isFreezing,
  isFog,
  type RainSnapshot,
} from './rain';

import { drawFog, drawLightning, drawSnowflake } from './weather-effects';

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
  kindChance: number;
  kind: 'rain' | 'snow' | 'hail' | 'freezing';
  storm: boolean;
  fog: boolean;
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
  let stormDrops: Drop[] = [];
  let fogDrops: Drop[] = [];
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
      if (
        !raf &&
        !document.hidden &&
        !motion.matches &&
        (activeDrops || stormDrops.length || fogDrops.length)
      )
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
      stormDrops = [];
      fogDrops = [];
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
      Object.assign(d, appearance(rain, d.chance, d.kindChance));
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
      const chance = random(id * 7 + 3);
      const kindChance = random(id * 7 + 6);
      // Retain invisible candidates too: repeated pans must not progressively
      // turn light rain into heavy rain by rerolling the same density budget.
      drops.push({
        longitude: point.lng,
        latitude: point.lat,
        ...anchor(point.lng, point.lat, rain?.elevation ?? 0),
        ...appearance(rain, chance, kindChance),
        chance,
        kindChance,
        phase: random(id * 7 + 4),
        speed: 0.55 + random(id * 7 + 5) * 0.4,
      });
    }
    activeDrops = drops.filter((d) => d.strength > 0).length;
    stormDrops = drops.filter((d) => {
      const p = project(d.ground);
      return (
        d.storm &&
        p &&
        p.x > 25 &&
        p.x < width - 25 &&
        p.y > 200 &&
        p.y < height - 25
      );
    });
    // A bounded set of soft patches, anchored only in sampled fog areas.
    fogDrops = drops.filter((d) => d.fog && d.chance < 0.12).slice(0, 80);
    canvas.dataset.fogCount = String(fogDrops.length);
    canvas.dataset.rainParticles = String(activeDrops);
    for (const kind of ['rain', 'snow', 'hail', 'freezing'] as const)
      canvas.dataset[`${kind}Count`] = String(
        drops.filter((d) => d.strength > 0 && d.kind === kind).length,
      );
    canvas.dataset.stormCells = String(stormDrops.length);
  }
  function appearance(
    rain: ReturnType<typeof rainAt>,
    chance: number,
    kindChance: number,
  ): Pick<Drop, 'strength' | 'kind' | 'storm' | 'fog'> {
    const liquid = rain ? rainStrength(rain.rate) : 0;
    const snow =
      rain && rain.snowRate >= 0.01
        ? rainStrength(Math.max(0.05, rain.snowRate * 2))
        : 0;
    const strength = Math.min(1, liquid + snow);
    const kind =
      snow > 0 && kindChance < snow / (liquid + snow)
        ? 'snow'
        : rain && isHail(rain.weatherCode) && kindChance < 0.4
          ? 'hail'
          : rain && isFreezing(rain.weatherCode)
            ? 'freezing'
            : 'rain';
    return {
      strength: chance <= strength ? strength : 0,
      kind,
      storm: !!rain && isThunderstorm(rain.weatherCode),
      fog: !!rain && isFog(rain.weatherCode),
    };
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
    for (const d of fogDrops) {
      const p = project(d.ground);
      if (p) drawFog(ctx, p.x, p.y, d.phase, time);
    }
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
      const speed =
        d.kind === 'snow'
          ? 0.08 + d.kindChance * 0.12
          : d.kind === 'hail'
            ? 1.7
            : 0.65 + d.strength * 1.1;
      const progress = (d.phase + time * d.speed * speed) % 1;
      const drift =
        d.kind === 'snow'
          ? Math.sin(d.phase * 20 + time * (0.35 + d.kindChance * 0.4)) *
            (12 + d.kindChance * 15) *
            Math.sin(progress * Math.PI)
          : 0;
      const x = top.x + dx * progress + drift,
        y = top.y + dy * progress;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const length = Math.min(distance * progress, 2 + d.strength * 21);
      const fade = Math.min(1, progress * 6, (1 - progress) * 8);
      if (d.kind === 'snow') {
        drawSnowflake(
          ctx,
          x,
          y,
          d.kindChance,
          d.phase * Math.PI * 2 + time * (d.kindChance - 0.5) * 0.5,
          fade,
        );
        continue;
      }
      if (d.kind === 'hail') {
        const radius = 1.5 + d.strength;
        ctx.globalAlpha = fade * 0.85;
        ctx.beginPath();
        ctx.moveTo(x, y - radius * 1.5);
        ctx.lineTo(x + radius, y);
        ctx.lineTo(x, y + radius * 1.5);
        ctx.lineTo(x - radius, y);
        ctx.closePath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#64748b';
        ctx.stroke();
        ctx.fillStyle = '#bae6fd';
        ctx.fill();
        continue;
      }
      // Deep blue halo and bright blue centre stay legible on streets/satellite.
      ctx.globalAlpha = fade * (0.3 + d.strength * 0.4);
      ctx.beginPath();
      ctx.moveTo(x - (dx / distance) * length, y - (dy / distance) * length);
      ctx.lineTo(x, y);
      ctx.lineWidth = 1.4 + d.strength * 2;
      ctx.strokeStyle = '#1d4ed8';
      ctx.stroke();
      ctx.lineWidth = 0.65 + d.strength;
      ctx.strokeStyle = d.kind === 'freezing' ? '#c4b5fd' : '#38bdf8';
      ctx.stroke();
    }
    // One branching, local bolt at most every nine seconds. These illustrate a
    // modelled storm area, never observed strike locations. No full-map flashes.
    canvas.dataset.lightning = 'idle';
    if (stormDrops.length) {
      const cycle = Math.floor(time / 9);
      const phase = (time % 9) / 0.75;
      const opacity = motion.matches
        ? 0.8
        : phase < 1
          ? Math.sin(phase * Math.PI) * 0.9
          : 0;
      if (opacity > 0) {
        const storm = stormDrops[cycle % stormDrops.length];
        const p = project(storm.ground);
        if (p) {
          drawLightning(ctx, p.x, p.y, cycle + storm.phase * 100, opacity);
          canvas.dataset.lightning = motion.matches ? 'static' : 'visible';
        }
      }
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
    if (activeDrops || stormDrops.length || fogDrops.length)
      raf = requestAnimationFrame(tick);
  }
  const start = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    draw(performance.now());
    if (
      !document.hidden &&
      !motion.matches &&
      snapshot &&
      (activeDrops || stormDrops.length || fogDrops.length)
    )
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
