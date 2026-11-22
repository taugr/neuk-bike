import { MercatorCoordinate } from 'maplibre-gl';
import {
  shopfrontFragmentShader,
  type ShopfrontMatcher,
} from './map-aerial-shopfronts';
import {
  princesStreetHorizontalCoordinates,
  princesStreetVerticalCoordinate,
} from './princes-street-facades';
import {
  appendPrincesStreetArchitecture,
  modeledFacadeShader,
} from './princes-street-architecture';
import { gridFractions } from './waverley-roof-profile';
import { facadeJointFractions, type FacadeJoints } from './map-terrace-joints';
import type { HistoricWall } from './edinburgh-historic-facades';
import { castleStoneShader } from './edinburgh-castle-material';
import {
  appendResidentialFacade,
  residentialFacadeShader,
} from './map-residential-facade';
import surveyBands from '@/data/princes-street-lidar-bands.json';

export const wallVertexStride = 12;
export const roofOutlineStride = 8;
export const facadePhotoPath = '/textures/waverley-gate-facades.webp';

export const wallFragmentShader = `
${shopfrontFragmentShader}
${modeledFacadeShader}
${residentialFacadeShader}
${castleStoneShader}
vec3 shadeTerraceStone(vec3 stone, highp vec2 joints, highp float along, float eave, float tone) {
  float pixel = clamp(fwidth(along), 0.025, 0.85);
  float left = joints.x < 0.0 ? 100.0 : joints.x;
  float right = joints.y < 0.0 ? 100.0 : joints.y;
  float jointDistance = min(left, right);
  float groove = 1.0 - smoothstep(0.045, 0.13 + pixel * 0.43, jointDistance);
  float recess = 1.0 - smoothstep(0.04, 0.49 + pixel * 0.24, jointDistance);
  float bevel = smoothstep(0.09, 0.22, right) * (1.0 - smoothstep(0.26, 0.46, right));
  float cornice = smoothstep(0.10, 0.22, eave) * (1.0 - smoothstep(0.26, 0.39, eave));
  float soffit = smoothstep(0.28, 0.47, eave) * (1.0 - smoothstep(0.57, 0.91, eave));
  return stone * (1.0 - tone * 0.065) *
    (1.0 - groove * 0.31 - recess * 0.19 + bevel * 0.12 + cornice * 0.13 - soffit * 0.09);
}
vec3 shadeWall(vec4 wall, float belowEave, bool hasPhoto, bool surveyed, float roofDetail, vec4 surface) {
  wall.w = floor(wall.w + 0.5);
  if (u_shaded_buildings) {
    if (surface.y == -4.0)
      return shadeCastleSurface(surface.x, wall.xy, surface.zw, wall.z);
    vec3 stone = wall.w == 2.0 ? vec3(0.58, 0.58, 0.56) : vec3(0.64, 0.60, 0.54);
    float groundShadow = mix(0.80, 1.0, smoothstep(-1.0, 4.0, wall.y));
    float eaveShadow = 1.0 - 0.17 * (1.0 - smoothstep(0.0, 1.05, belowEave));
    if (surface.y >= 2.0)
      return shadeResidentialOpening(surface.x, surface.zw, surface.y) * wall.z * groundShadow;
    vec3 masonry = shadeFacadeMaterial(surface.x, stone, wall.xy, surface.zw, surface.y);
    if (surface.y < 0.0)
      masonry = shadeTerraceStone(masonry, surface.zw, wall.x, belowEave, -surface.y - 1.0);
    return masonry * wall.z * groundShadow * eaveShadow;
  }
  bool photoFace = wall.w >= 3.0;
  bool modern = wall.w == 2.0;
  bool storefront = !photoFace && surface.y > 0.5;
  vec2 metres = wall.xy;
  float row = floor(metres.y / 0.34);
  vec2 block = fract(vec2(metres.x / 1.08 + mod(row, 2.0) * 0.5, metres.y / 0.34));
  float mortar = smoothstep(0.018, 0.065, min(block.y, min(block.x, 1.0 - block.x)));
  float blockShade = fract(sin(dot(floor(vec2(metres.x / 1.08, row)), vec2(17.17, 59.4))) * 437.59);
  vec3 stone = mix(vec3(0.51, 0.45, 0.37), vec3(0.71, 0.63, 0.52), blockShade * 0.35 + 0.35);
  stone *= mix(0.85, 1.03, mortar);

  float floorHeight = modern ? 3.6 : 4.1;
  float bayWidth = modern ? 2.8 : 3.45;
  vec2 bay = fract(metres / vec2(bayWidth, floorHeight));
  float frame = max(abs(bay.x - 0.5) - (modern ? 0.38 : 0.22), abs(bay.y - 0.47) - 0.29);
  float windowFade = 1.0 - smoothstep(0.18, 0.5, length(fwidth(metres / vec2(bayWidth, floorHeight))));
  float opening = (1.0 - smoothstep(-0.012, 0.012, frame)) * windowFade;
  float surround = (1.0 - smoothstep(0.01, 0.043, frame)) * windowFade;
  float windowed = step(0.4, metres.y) * (wall.w == 1.0 || photoFace ? 0.0 : 1.0);
  float rail = 1.0 - smoothstep(0.018, 0.05, min(bay.y, 1.0 - bay.y));
  vec3 glass = mix(vec3(0.15, 0.205, 0.225), vec3(0.32, 0.37, 0.39), bay.y);
  float mullion = (1.0 - smoothstep(0.013, 0.033, abs(bay.x - 0.5))) * windowFade;
  glass = mix(glass, vec3(0.51, 0.50, 0.46), mullion * 0.65);
  vec3 facade = modern ? mix(stone, vec3(0.49, 0.50, 0.50), 0.75) : stone;
  facade = mix(facade, facade * 1.19, (surround * 0.72 + rail * 0.28) * windowed);
  facade = mix(facade, glass, opening * windowed);
  if (storefront) {
    float streetBand = smoothstep(-0.10, 0.13, surface.x) * (1.0 - smoothstep(3.68, 3.92, surface.x));
    facade = mix(facade, shadeShopfront(vec2(metres.x, surface.x), stone, modern ? 1.0 : 0.0, wall.z), streetBand);
  }
  if (surveyed) {
    vec3 daylight = mix(vec3(0.83, 0.91, 1.0), vec3(1.09, 1.02, 0.90), clamp((wall.z - 0.65) / 0.52, 0.0, 1.0));
    float contact = mix(0.70, 1.0, smoothstep(-1.5, 3.3, storefront ? surface.x : metres.y));
    facade *= daylight * wall.z * contact;
    // Light on the eave and a softer shadow immediately underneath.
    float trim = 1.0 - smoothstep(0.12, 0.58, belowEave);
    float occlusion = (1.0 - trim) * (1.0 - smoothstep(0.38, 1.15, belowEave));
    facade = mix(facade, facade * 0.52, occlusion * 0.65);
    float edgeLight = trim * mix(0.87, 0.19, smoothstep(0.0, 0.72, roofDetail));
    facade = mix(facade, mix(vec3(0.55, 0.59, 0.59), vec3(0.80, 0.78, 0.69), min(1.0, wall.z)), edgeLight);
  } else {
    facade *= wall.z * mix(0.76, 1.0, smoothstep(-7.0, 4.0, metres.y));
  }
  if (photoFace && hasPhoto) {
    float part = wall.w - 3.0;
    vec2 uv = vec2((mix(0.006, 0.994, clamp(surface.x, 0.0, 1.0)) + part) * 0.5, 1.0 - clamp(surface.y, 0.0, 1.0));
    vec3 photo = texture(u_tile, uv).rgb;
    // Lift the dark side of the photo slightly while retaining its shadows.
    photo = mix(photo, sqrt(photo), 0.23 * part) * mix(0.88, 1.0, part);
    float coverage = smoothstep(0.0, 0.055, surface.y) *
      (surveyed ? 1.0 - smoothstep(0.98, 1.02, surface.y) : 1.0);
    facade = mix(facade, photo, coverage);
  }
  if (u_frontage_available && all(greaterThanEqual(surface.zw, vec2(0.0))) &&
      all(lessThanEqual(surface.zw, vec2(1.0)))) {
    vec4 photo = texture(u_frontage_tile, surface.zw);
    facade = mix(facade, photo.rgb, photo.a);
  }
  return facade;
}`;

type Point = { x: number; y: number };
const gateCorner = MercatorCoordinate.fromLngLat([-3.188846, 55.953186]);
// Elevations of the cropped photo at the pavement and cornice, aligned to
// the local survey. A fixed height keeps the floors level across roof steps.
const gatePhotoBottom = 67.5;
const gatePhotoTop = 91.5;
const gateFronts = [
  MercatorCoordinate.fromLngLat([-3.187945, 55.953369]),
  MercatorCoordinate.fromLngLat([-3.188594, 55.952711]),
].map((end) => {
  const dx = end.x - gateCorner.x;
  const dy = end.y - gateCorner.y;
  return { dx, dy, length: Math.hypot(dx, dy) };
});

/** The north and west elevations share the corner shown in the source photo. */
export function waverleyGatePhotoCoordinates(start: Point, end: Point) {
  for (const [side, { dx, dy, length }] of gateFronts.entries()) {
    // The Waterloo Place elevation steps back behind projecting bays.
    const tolerance =
      gateCorner.meterInMercatorCoordinateUnits() * (side === 0 ? 4.8 : 2.2);
    const offsets = [start, end].map(({ x, y }) => ({
      x: x - gateCorner.x,
      y: y - gateCorner.y,
    }));
    if (
      offsets.some(({ x, y }) => Math.abs(x * dy - y * dx) > tolerance * length)
    )
      continue;
    const positions = offsets.map(
      ({ x, y }) => (x * dx + y * dy) / (length * length),
    );
    if (
      positions.some((u) => u < -0.025 || u > 1.025) ||
      Math.abs(positions[1] - positions[0]) < 0.02
    )
      continue;
    const [u0, u1] = positions.map((u) => Math.min(1, Math.max(0, u)));
    return { side, u0: side === 0 ? 1 - u0 : u0, u1: side === 0 ? 1 - u1 : u1 };
  }
}

export function appendAerialWalls(
  vertices: number[],
  rings: readonly Point[][],
  {
    height,
    base,
    terrain,
    origin,
    tileScale,
    metresPerUnit,
    material,
    masonry,
    facadeJoints,
    terraceFaces,
    historicFaces,
    profile,
    outlines,
    shopfront,
    pavementElevation,
    photoFrontage,
    photoGate = true,
    surveyFrontage,
    modeledFrontage,
    step,
  }: {
    height: number;
    base: number;
    terrain: number;
    origin: Point;
    tileScale: number;
    metresPerUnit: number;
    material: number;
    masonry?: number;
    facadeJoints?: FacadeJoints;
    terraceFaces?: ReadonlyMap<number, 'front' | 'rear'>;
    historicFaces?: ReadonlyMap<number, HistoricWall>;
    profile?: (point: Point) => number;
    outlines?: number[];
    shopfront?: ShopfrontMatcher;
    pavementElevation?: (point: Point) => number | undefined;
    photoFrontage?: boolean;
    photoGate?: boolean;
    surveyFrontage?: boolean;
    modeledFrontage?: boolean;
    step: number;
  },
) {
  let includesPhoto = false;
  let includesFrontage = false;
  let shopfrontSegments = 0;
  let measuredBands = 0;
  let modeledOpenings = 0;
  let historicOpenings = 0;
  const bottom = base > 0 ? base : -10;
  for (const [ringIndex, ring] of rings.entries()) {
    const next = (i: number) => ring[(i + 1) % ring.length];
    // Use translated coordinates for the signed area to avoid cancellation.
    const area = ring.reduce(
      (sum, point, i) =>
        sum +
        (point.x - ring[0].x) * (next(i).y - ring[0].y) -
        (point.y - ring[0].y) * (next(i).x - ring[0].x),
      0,
    );
    const exterior = Math.sign(area) * (ringIndex ? -1 : 1);
    for (const [i, start] of ring.entries()) {
      const end = next(i);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const distance = Math.hypot(dx, dy);
      const metres = distance * metresPerUnit;
      if (!exterior || metres < 0.25) continue;
      const normalX = (exterior * dy) / distance;
      const normalY = (exterior * -dx) / distance;
      const offset = profile ? 0 : 0.09 / metresPerUnit;
      const light = profile
        ? 0.68 +
          0.47 * Math.max(0, 0.76 * normalX + 0.65 * normalY) +
          0.23 * Math.max(0, -0.95 * normalX - 0.31 * normalY)
        : 0.7 + 0.27 * Math.max(0, -0.57 * normalX - 0.82 * normalY);
      const photo =
        photoGate && ringIndex === 0 && height >= 26 && base === 0
          ? waverleyGatePhotoCoordinates(start, end)
          : undefined;
      const facade = photo ? 3 + photo.side : material;
      includesPhoto ||= !!photo;
      const frontageCoordinates =
        (photoFrontage || surveyFrontage || modeledFrontage) &&
        ringIndex === 0 &&
        base === 0
          ? princesStreetHorizontalCoordinates(start, end, {
              x: normalX,
              y: normalY,
            })
          : undefined;
      const frontage = photoFrontage ? frontageCoordinates : undefined;
      includesFrontage ||= !!frontage;
      const joints =
        facadeJoints && ringIndex === 0
          ? facadeJointFractions(start, end, metres, facadeJoints)
          : [];
      const divided = joints.some((joint) => joint > 0 && joint < 1);
      const stockbridge = ringIndex === 0 ? terraceFaces?.get(i) : undefined;
      const historic =
        ringIndex === 0 && !stockbridge ? historicFaces?.get(i) : undefined;
      const residence = stockbridge || historic;
      const closestJoint = (fraction: number) => {
        const following = joints.findIndex((joint) => joint > fraction);
        return following === -1 ? joints.length : following;
      };
      const terraceShade = (t: number, index: number) => {
        const left = joints[index - 1];
        const right = joints[index];
        return [
          left === undefined ? -1 : Math.max(0, t - left) * metres,
          right === undefined ? -1 : Math.max(0, right - t) * metres,
          divided ? index % 2 : 0,
        ] as const;
      };
      const vertex = (
        point: Point,
        fraction: number,
        level: number,
        eave: number,
        pavement?: number,
        projection = 0,
        surfaceLight = 1,
        stone = masonry ?? 0,
        opening?: readonly [number, number, number],
        terrace?: readonly [left: number, right: number, tone: number],
      ) => {
        const elevation = terrain + level;
        const surface = photo
          ? [
              photo.u0 + (photo.u1 - photo.u0) * fraction,
              profile
                ? (elevation - gatePhotoBottom) /
                  (gatePhotoTop - gatePhotoBottom)
                : level / height,
            ]
          : pavement === undefined
            ? [stone, terrace ? -1 - terrace[2] : (opening?.[2] ?? 0)]
            : [elevation - pavement, 1];
        return [
          (point.x - origin.x + normalX * (offset + projection)) * tileScale,
          (point.y - origin.y + normalY * (offset + projection)) * tileScale,
          elevation,
          metres * fraction,
          level,
          light * surfaceLight,
          facade,
          eave - level,
          ...surface,
          frontage
            ? frontage[0] + (frontage[1] - frontage[0]) * fraction
            : (terrace?.[0] ?? opening?.[0] ?? -1),
          frontage
            ? princesStreetVerticalCoordinate(elevation)
            : (terrace?.[1] ?? opening?.[1] ?? -1),
        ];
      };
      const wallBreaks = Array.from(
        new Set([
          0,
          1,
          ...(profile
            ? [
                ...gridFractions(start.x, end.x, step),
                ...gridFractions(start.y, end.y, step),
              ]
            : []),
        ]),
      ).sort((a, b) => a - b);
      const cuts = divided
        ? Array.from(new Set([...wallBreaks, ...joints])).sort((a, b) => a - b)
        : wallBreaks;
      const pointAt = (t: number) => ({
        x: start.x + dx * t,
        y: start.y + dy * t,
      });
      const eaves =
        (divided || residence) && profile
          ? wallBreaks.map((t) => profile(pointAt(t)) - terrain)
          : undefined;
      // The added façade joints stay on the existing roof edge. Interpolate
      // between the original eave samples instead of refitting the roof.
      const wallHeight = (t: number, point: Point) => {
        if (!eaves) return profile ? profile(point) - terrain : height;
        const i = wallBreaks.findIndex((cut) => cut >= t);
        if (wallBreaks[i] === t) return eaves[i];
        const proportion =
          (t - wallBreaks[i - 1]) / (wallBreaks[i] - wallBreaks[i - 1]);
        return eaves[i - 1] + (eaves[i] - eaves[i - 1]) * proportion;
      };
      const modeledEdge = modeledFrontage && frontageCoordinates;
      if (modeledEdge) {
        const [from, to] = modeledEdge;
        const fractionAt = (u: number) => (u - from) / (to - from);
        const eaveAt = (point: Point) => profile?.(point) ?? terrain + height;
        modeledOpenings += appendPrincesStreetArchitecture(
          vertices,
          modeledEdge,
          cuts.slice(1, -1).map((t) => from + (to - from) * t),
          terrain + bottom,
          (u) => eaveAt(pointAt(fractionAt(u))),
          (u, elevation, projection, stone, surfaceLight, opening) => {
            const t = fractionAt(u);
            const point = pointAt(t);
            return vertex(
              point,
              t,
              elevation - terrain,
              eaveAt(point) - terrain,
              undefined,
              projection / metresPerUnit,
              surfaceLight,
              stone,
              opening,
            );
          },
        );
      }
      const residentialOpenings = residence
        ? appendResidentialFacade(vertices, {
            cuts,
            joints,
            metres,
            bottom,
            street: stockbridge === 'front' || historic?.street === true,
            historic,
            eave: (t) => wallHeight(t, pointAt(t)),
            ground: (t) => {
              const point = pointAt(t);
              const offset = 1.5 / metresPerUnit;
              const ground = pavementElevation?.({
                x: point.x + normalX * offset,
                y: point.y + normalY * offset,
              });
              return ground === undefined ? 0 : ground - terrain;
            },
            masonry: masonry ?? 0,
            doorSide: dy < -Math.abs(dx) * 0.35,
            vertex: (t, level, depth, stone, light, opening, section) => {
              const point = pointAt(t);
              return vertex(
                point,
                t,
                level,
                wallHeight(t, point),
                undefined,
                depth / metresPerUnit,
                light,
                stone,
                opening,
                opening ? undefined : terraceShade(t, section),
              );
            },
          })
        : 0;
      modeledOpenings += residentialOpenings;
      if (historic) historicOpenings += residentialOpenings;
      for (let j = 1; j < cuts.length; j++) {
        const t0 = cuts[j - 1];
        const t1 = cuts[j];
        let terrace0: readonly [number, number, number] | undefined;
        let terrace1: readonly [number, number, number] | undefined;
        if (facadeJoints) {
          const index = closestJoint((t0 + t1) / 2);
          terrace0 = terraceShade(t0, index);
          terrace1 = terraceShade(t1, index);
        }
        const p0 = pointAt(t0);
        const p1 = pointAt(t1);
        const h0 = wallHeight(t0, p0);
        const h1 = wallHeight(t1, p1);
        let ground0: number | undefined;
        let ground1: number | undefined;
        if (
          !photo &&
          !ringIndex &&
          pavementElevation &&
          shopfront?.(p0, p1, { x: normalX, y: normalY }, metresPerUnit)
        ) {
          // Sample the sidewalk just beyond the wall to avoid pulling the
          // front up or down to the terrain at the building's centre.
          const setback = 1.7 / metresPerUnit;
          const sidewalk = (point: Point) =>
            pavementElevation({
              x: point.x + normalX * setback,
              y: point.y + normalY * setback,
            });
          const g0 = sidewalk(p0);
          const g1 = sidewalk(p1);
          if (
            g0 !== undefined &&
            g1 !== undefined &&
            Math.min(terrain + h0 - g0, terrain + h1 - g1) > 3.7
          ) {
            ground0 = g0;
            ground1 = g1;
            shopfrontSegments++;
          }
        }
        const low0 =
          ground0 === undefined
            ? bottom
            : Math.min(bottom, ground0 - terrain - 0.2);
        const low1 =
          ground1 === undefined
            ? bottom
            : Math.min(bottom, ground1 - terrain - 0.2);
        const a = vertex(
          p0,
          t0,
          Math.min(low0, h0),
          h0,
          ground0,
          0,
          1,
          masonry,
          undefined,
          terrace0,
        );
        const b = vertex(
          p1,
          t1,
          Math.min(low1, h1),
          h1,
          ground1,
          0,
          1,
          masonry,
          undefined,
          terrace1,
        );
        const c = vertex(
          p1,
          t1,
          h1,
          h1,
          ground1,
          0,
          1,
          masonry,
          undefined,
          terrace1,
        );
        const d = vertex(
          p0,
          t0,
          h0,
          h0,
          ground0,
          0,
          1,
          masonry,
          undefined,
          terrace0,
        );
        if (!modeledEdge && !residentialOpenings)
          vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
        if (outlines && t1 > t0) {
          const first = d.slice(0, 3);
          const last = c.slice(0, 3);
          // Reverse the sign at the other endpoint, where the tangent points back.
          outlines.push(
            ...first,
            ...last,
            1,
            1,
            ...first,
            ...last,
            -1,
            -1,
            ...last,
            ...first,
            -1,
            1,
            ...first,
            ...last,
            -1,
            -1,
            ...last,
            ...first,
            1,
            -1,
            ...last,
            ...first,
            -1,
            1,
          );
        }
      }
      if (surveyFrontage && frontageCoordinates && profile) {
        const [u0, u1] = frontageCoordinates;
        for (const band of surveyBands) {
          const from = Math.max(band.from, Math.min(u0, u1));
          const to = Math.min(band.to, Math.max(u0, u1));
          if (to - from < 0.003) continue;
          const t0 = (from - u0) / (u1 - u0);
          const t1 = (to - u0) / (u1 - u0);
          const p0 = { x: start.x + dx * t0, y: start.y + dy * t0 };
          const p1 = { x: start.x + dx * t1, y: start.y + dy * t1 };
          const h0 = profile(p0) - terrain;
          const h1 = profile(p1) - terrain;
          const top = band.elevation - terrain + 0.08;
          const low = top - 0.2;
          if (top > Math.min(h0, h1) - 0.18) continue;
          // Heights and spans come from repeated laser returns. Use a
          // restrained extrusion where the cross-section is unresolved.
          const depth = 0.28 / metresPerUnit;
          const cap0 = vertex(p0, t0, top, h0, undefined, 0, 1.09);
          const cap1 = vertex(p1, t1, top, h1, undefined, 0, 1.09);
          const lip0 = vertex(p0, t0, top, h0, undefined, depth, 1.09);
          const lip1 = vertex(p1, t1, top, h1, undefined, depth, 1.09);
          const front0 = vertex(p0, t0, low, h0, undefined, depth, 0.74);
          const front1 = vertex(p1, t1, low, h1, undefined, depth, 0.74);
          const back0 = vertex(p0, t0, low, h0, undefined, 0, 0.74);
          const back1 = vertex(p1, t1, low, h1, undefined, 0, 0.74);
          vertices.push(
            ...cap0,
            ...cap1,
            ...lip1,
            ...cap0,
            ...lip1,
            ...lip0,
            ...lip0,
            ...lip1,
            ...front1,
            ...lip0,
            ...front1,
            ...front0,
            ...front0,
            ...front1,
            ...back1,
            ...front0,
            ...back1,
            ...back0,
            ...cap0,
            ...lip0,
            ...front0,
            ...cap0,
            ...front0,
            ...back0,
            ...cap1,
            ...lip1,
            ...front1,
            ...cap1,
            ...front1,
            ...back1,
          );
          measuredBands++;
        }
      }
    }
  }
  return {
    includesPhoto,
    includesFrontage,
    shopfrontSegments,
    measuredBands,
    modeledOpenings,
    historicOpenings,
  };
}
