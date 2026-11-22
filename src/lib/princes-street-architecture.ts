import architecture from '@/data/princes-street-architecture.json';
import {
  princesStreetElevation,
  princesStreetHorizontalCoordinates,
} from './princes-street-facades';

const width = 1535;
const glass = 6;
const trim = 7;
const seam = 14;
const sash = 15;
const darkFrame = 5;
const position = (x: number) => x / width;
const elevation = (y: number, x: number, rise = 0) =>
  princesStreetElevation((y - (rise * (x - 805)) / (width - 805)) / 407);
const sectionAt = (u: number) =>
  architecture.sections.find(({ through }) => u < position(through)) ??
  architecture.sections[architecture.sections.length - 1];

type Point = { x: number; y: number };

/** Fit the street cornice where the raster rounds the roof edge down to the pavement. */
export function fitPrincesStreetCornice(
  ring: readonly Point[],
  metresPerUnit: number,
  measured: (point: Point) => number,
) {
  // The registered frontage faces south, regardless of the ring winding.
  const streetEdges = ring.flatMap((start, i) => {
    const end = ring[(i + 1) % ring.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length * metresPerUnit < 0.25) return [];
    const outward = {
      x: (-dy * Math.sign(dx)) / length,
      y: Math.abs(dx) / length,
    };
    const span = princesStreetHorizontalCoordinates(start, end, outward);
    return span ? [{ start, dx, dy, length, outward, span }] : [];
  });
  if (streetEdges.length === 0) return measured;
  return (point: Point) => {
    const roof = measured(point);
    let corrected = roof;
    for (const { start, dx, dy, length, outward, span } of streetEdges) {
      const t = Math.max(
        0,
        Math.min(
          1,
          ((point.x - start.x) * dx + (point.y - start.y) * dy) /
            (length * length),
        ),
      );
      const x = start.x + dx * t;
      const y = start.y + dy * t;
      const distance = Math.hypot(point.x - x, point.y - y) * metresPerUnit;
      if (distance >= 3.5) continue;
      const u = span[0] + (span[1] - span[0]) * t;
      const section = sectionAt(u);
      const tracedCornice = elevation(section.cornice, u * width, section.rise);
      const innerRoof = measured({
        x: x - (outward.x * 4.5) / metresPerUnit,
        y: y - (outward.y * 4.5) / metresPerUnit,
      });
      const top = Math.min(tracedCornice, innerRoof + 0.5);
      const blend = 1 - distance / 3.5;
      corrected = Math.max(corrected, roof + (top - roof) * blend * blend);
    }
    return corrected;
  };
}

type Opening = {
  from: number;
  to: number;
  bottom: number;
  top: number;
  arch: number;
  depth: number;
  panes: number;
  frame: number;
  transom: number;
  fascia?: number;
  door?: number[];
};

const openings: Opening[] = [
  ...architecture.rows.flatMap((row) =>
    row.centres.map((x) => ({
      from: position(x - row.width / 2),
      to: position(x + row.width / 2),
      top: elevation(row.top, x, row.rise),
      bottom: elevation(row.bottom, x, row.rise),
      arch: row.style === 'arch' ? 0.45 : row.style === 'fan' ? 0.32 : 0,
      depth: row.style === 'bay' ? 0.4 : row.style === 'sash' ? -0.44 : -0.54,
      panes: row.style === 'sash' ? 1 : row.panes,
      frame: x < 448 ? sash : darkFrame,
      transom: row.style === 'sash' ? 0.48 : 0.69,
    })),
  ),
  ...architecture.shops.map((shop) => ({
    from: position(shop.from),
    to: position(shop.to),
    top: elevation(shop.top, shop.from),
    bottom: elevation(shop.bottom, shop.from),
    arch: 0,
    depth: -0.66,
    panes: shop.panes,
    frame: shop.fascia,
    transom: 0.71,
    fascia: shop.fascia,
    door: shop.door,
  })),
].sort((a, b) => a.bottom - b.bottom);

export const modeledFacadeShader = `
vec3 shadeFacadeMaterial(float material, vec3 fallback, highp vec2 metres, highp vec2 opening, float recessed) {
  const vec3 palette[15] = vec3[15](
    vec3(0.84, 0.81, 0.73), vec3(0.70, 0.60, 0.49),
    vec3(0.65, 0.62, 0.56), vec3(0.78, 0.67, 0.54),
    vec3(0.21, 0.23, 0.24), vec3(0.30, 0.37, 0.40),
    vec3(0.78, 0.71, 0.61), vec3(0.15, 0.22, 0.32),
    vec3(0.20, 0.52, 0.53), vec3(0.19, 0.18, 0.17),
    vec3(0.55, 0.44, 0.37), vec3(0.27, 0.40, 0.31),
    vec3(0.85, 0.83, 0.74), vec3(0.35, 0.31, 0.27),
    vec3(0.88, 0.86, 0.77)
  );
  int index = int(floor(material + 0.5)) - 1;
  if (index < 0) return fallback;
  vec3 color = palette[clamp(index, 0, 14)];
  if (index == 5) {
    // Attenuate reflected sky toward the lintel and the shaded jamb.
    float side = smoothstep(0.0, 0.19, opening.x) * (1.0 - smoothstep(0.88, 1.0, opening.x));
    float head = 1.0 - smoothstep(0.64, 1.0, opening.y);
    float sky = smoothstep(0.10, 0.66, opening.y);
    float shade = mix(0.57, 1.0, side * head);
    return mix(color * 0.78, color * 1.38, sky) * mix(1.0, shade, recessed);
  }
  if (index < 4 || index == 6) {
    highp vec2 block = metres / vec2(0.95, 0.38);
    block.x += mod(floor(block.y), 2.0) * 0.5;
    highp vec2 joint = abs(fract(block) - 0.5);
    float mortar = smoothstep(0.43, 0.5, max(joint.x, joint.y));
    float visibility = 1.0 - smoothstep(0.23, 0.78, length(fwidth(block)));
    float grain = fract(sin(dot(floor(block), vec2(41.7, 98.3))) * 43758.54) - 0.5;
    color *= 1.0 + (0.11 * grain - 0.13 * mortar) * visibility;
  }
  return color;
}`;

type Vertex = (
  u: number,
  height: number,
  projection: number,
  material: number,
  light?: number,
  opening?: readonly [x: number, y: number, recessed: number],
) => number[];

/** Cut the surveyed wall at photo-traced openings and add solid reveals and trim. */
export function appendPrincesStreetArchitecture(
  vertices: number[],
  edge: readonly [number, number],
  roofCuts: readonly number[],
  floor: number,
  eave: (u: number) => number,
  vertex: Vertex,
) {
  const start = Math.min(...edge);
  const end = Math.max(...edge);
  const visible = openings.filter(({ from, to }) => from < end && to > start);
  const seams = architecture.seams.map(position);
  const cuts = Array.from(
    new Set([
      start,
      end,
      ...roofCuts,
      ...seams,
      ...visible.flatMap(({ from, to, arch, door }) => [
        from,
        to,
        ...(arch
          ? [from + (to - from) * 0.2, (from + to) / 2, to - (to - from) * 0.2]
          : []),
        ...(door?.map((x) => from + (to - from) * x) ?? []),
      ]),
    ]),
  )
    .filter((u) => u >= start && u <= end)
    .sort((a, b) => a - b);

  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  const face = (
    l: number,
    r: number,
    bottomL: number,
    bottomR: number,
    topL: number,
    topR: number,
    depth: number,
    material: number,
    light = 1,
  ) => {
    if (r <= l) return;
    quad(
      vertex(l, bottomL, depth, material, light),
      vertex(r, bottomR, depth, material, light),
      vertex(r, topR, depth, material, light),
      vertex(l, topL, depth, material, light),
    );
  };
  const cap = (
    l: number,
    r: number,
    y0: number,
    y1: number,
    back: number,
    front: number,
    material: number,
    light: number,
  ) => {
    quad(
      vertex(l, y0, back, material, light),
      vertex(r, y1, back, material, light),
      vertex(r, y1, front, material, light),
      vertex(l, y0, front, material, light),
    );
  };
  const jamb = (
    u: number,
    bottom: number,
    top: number,
    back: number,
    front: number,
    material: number,
    light: number,
  ) => {
    quad(
      vertex(u, bottom, back, material, light),
      vertex(u, bottom, front, material, light),
      vertex(u, top, front, material, light),
      vertex(u, top, back, material, light),
    );
  };
  const rendered = new Set<Opening>();
  for (let i = 1; i < cuts.length; i++) {
    const l = cuts[i - 1];
    const r = cuts[i];
    if (r - l < 1e-8) continue;
    const middle = (l + r) / 2;
    const stone = sectionAt(middle).stone;
    const eaveL = eave(l);
    const eaveR = eave(r);
    let cursorL = Math.min(floor, eaveL);
    let cursorR = Math.min(floor, eaveR);
    for (const opening of visible) {
      const {
        from,
        to,
        top,
        bottom,
        depth,
        frame,
        arch,
        transom,
        fascia,
        door,
      } = opening;
      if (middle <= from || middle >= to) continue;
      const head = (u: number) => {
        const x = Math.min(1, Math.abs((2 * (u - from)) / (to - from) - 1));
        return top - arch * (1 - Math.sqrt(1 - x * x));
      };
      const low = Math.max(bottom, cursorL, cursorR);
      const highL = Math.min(head(l), eaveL - 0.08);
      const highR = Math.min(head(r), eaveR - 0.08);
      if (Math.min(highL, highR) < low + 0.22) continue;
      const across = (fraction: number) => from + (to - from) * fraction;
      const entrance =
        door && middle > across(door[0]) && middle < across(door[1]);
      const glassDepth = depth - (entrance ? 0.26 : 0);
      const glassVertex = (u: number, height: number, vertical: number) =>
        vertex(u, height, glassDepth, glass, 0.91, [
          (u - from) / (to - from),
          vertical,
          depth < 0 ? 1 : 0,
        ]);
      face(l, r, cursorL, cursorR, low, low, 0, stone);
      quad(
        glassVertex(l, low, 0),
        glassVertex(r, low, 0),
        glassVertex(r, highR, 1),
        glassVertex(l, highL, 1),
      );
      cap(l, r, low, low, 0, glassDepth, trim, 0.93);
      cap(l, r, highL, highR, 0, glassDepth, stone, 0.52);
      if (l === from || l === start)
        jamb(l, low, highL, 0, glassDepth, stone, 0.86);
      if (r === to || r === end)
        jamb(r, low, highR, 0, glassDepth, stone, 0.59);
      if (entrance && door) {
        if (l === across(door[0]))
          jamb(l, low, highL, depth, glassDepth, frame, 0.74);
        if (r === across(door[1]))
          jamb(r, low, highR, depth, glassDepth, frame, 0.6);
      }

      const frameDepth = glassDepth + 0.045;
      const border = fascia ? 0.13 : 0.08;
      const fasciaDepth = fascia ? 0.075 : frameDepth;
      const railHeight = Math.min(highL, highR) - (fascia ? 0.57 : border);
      if (fascia)
        cap(
          l,
          r,
          highL - 0.57,
          highR - 0.57,
          frameDepth,
          fasciaDepth,
          frame,
          0.65,
        );
      const rail = Math.min(highL, highR) - (fascia ? 0.57 : 0);
      face(
        l,
        r,
        highL - (fascia ? 0.57 : border),
        highR - (fascia ? 0.57 : border),
        highL,
        highR,
        fasciaDepth,
        frame,
      );
      face(l, r, low, low, low + border, low + border, frameDepth, frame);
      const crossbar = Math.min(rail - 0.08, low + (top - low) * transom);
      if (crossbar > low + border)
        face(
          l,
          r,
          crossbar - 0.045,
          crossbar - 0.045,
          crossbar + 0.045,
          crossbar + 0.045,
          frameDepth,
          frame,
        );
      const mullion = (fraction: number, halfWidth: number, head: number) =>
        face(
          Math.max(l, across(fraction) - halfWidth),
          Math.min(r, across(fraction) + halfWidth),
          low,
          low,
          head,
          head,
          frameDepth,
          frame,
        );
      const pier = fascia ? 0.0022 : 0.0011;
      for (let pane = 0; pane <= opening.panes; pane++) {
        const fraction = pane / opening.panes;
        if (!door || fraction < door[0] || fraction > door[1])
          mullion(fraction, pier, Math.min(rail + 0.04, highL, highR));
      }
      if (entrance && door) {
        const doorTop = Math.min(railHeight, low + 2.5);
        mullion(door[0], pier, doorTop);
        mullion(door[1], pier, doorTop);
        face(
          Math.max(l, across(door[0])),
          Math.min(r, across(door[1])),
          doorTop - 0.12,
          doorTop - 0.12,
          doorTop,
          doorTop,
          frameDepth,
          frame,
        );
      }
      const surround = stone === 1 ? sash : trim;
      const lip = Math.max(fascia ? 0.18 : 0.17, depth + 0.1);
      const h = fascia ? 0.2 : 0.18;
      const topL = Math.min(eaveL, highL + h);
      const topR = Math.min(eaveR, highR + h);
      if (topL > highL && topR > highR) {
        cap(l, r, highL, highR, 0, lip, surround, 0.59);
        face(l, r, highL, highR, topL, topR, lip, surround, 0.98);
        cap(l, r, topL, topR, 0, lip, surround, 1.14);
      }
      const jambWidth = fascia ? 0.002 : 0.0014;
      if (l === from) {
        face(
          Math.max(start, l - jambWidth),
          l,
          low,
          low,
          highL,
          highL,
          lip,
          surround,
          0.94,
        );
        jamb(l, low, highL, 0, lip, surround, 0.72);
      }
      if (r === to) {
        face(
          r,
          Math.min(end, r + jambWidth),
          low,
          low,
          highR,
          highR,
          lip,
          surround,
          1.02,
        );
        jamb(r, low, highR, 0, lip, surround, 0.6);
      }
      if (!fascia || !entrance) {
        const sill = lip + (fascia ? 0.04 : 0.15);
        const apron = low - (fascia ? 0.13 : 0.2);
        cap(l, r, low, low, 0, sill, surround, 1.15);
        face(l, r, apron, apron, low, low, sill, surround, 0.95);
        cap(l, r, apron, apron, 0, sill, surround, 0.6);
      }
      cursorL = highL;
      cursorR = highR;
      rendered.add(opening);
    }
    face(l, r, cursorL, cursorR, eaveL, eaveR, 0, stone);
  }

  for (const u of seams) {
    const l = Math.max(start, u - 0.0011);
    const r = Math.min(end, u + 0.0011);
    if (l >= r) continue;
    const top = Math.min(eave(l), eave(r));
    const low = Math.max(floor, elevation(401, u * width));
    if (top <= low) continue;
    face(l, r, low, low, top, top, 0.09, seam);
    jamb(r, low, top, 0, 0.09, trim, 0.91);
  }
  const piers = architecture.piers;
  for (const x of piers.positions) {
    const l = Math.max(start, position(x - 3));
    const r = Math.min(end, position(x + 3));
    if (l >= r) continue;
    const top = Math.min(
      eave(l) - 0.05,
      eave(r) - 0.05,
      elevation(piers.top, x, piers.rise),
    );
    const low = elevation(piers.bottom, x, piers.rise);
    if (top <= low) continue;
    face(l, r, low, low, top, top, 0.15, trim);
    jamb(l, low, top, 0, 0.15, trim, 0.86);
    jamb(r, low, top, 0, 0.15, trim, 0.74);
  }
  for (const band of architecture.trim) {
    const l = Math.max(start, position(band.from));
    const r = Math.min(end, position(band.to));
    if (l >= r) continue;
    const topL = Math.min(
      eave(l) - 0.05,
      elevation(band.top, l * width, band.rise),
    );
    const topR = Math.min(
      eave(r) - 0.05,
      elevation(band.top, r * width, band.rise),
    );
    const lowL = elevation(band.bottom, l * width, band.rise);
    const lowR = elevation(band.bottom, r * width, band.rise);
    if (topL <= lowL || topR <= lowR) continue;
    cap(l, r, topL, topR, 0, 0.18, trim, 1.12);
    face(l, r, lowL, lowR, topL, topR, 0.18, trim, 0.95);
    cap(l, r, lowL, lowR, 0, 0.18, trim, 0.64);
  }
  return rendered.size;
}
