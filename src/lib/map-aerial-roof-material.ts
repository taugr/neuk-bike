import {
  princesStreetModeledRoofBounds,
  princesStreetRoofCourts,
  princesStreetRoofDeck,
} from './princes-street-roof-photo';

const roofRect = (rect: readonly number[]) =>
  rect.map((x) => x.toFixed(2)).join(', ');

export const roofMaterialFragmentShader = `
float roofNoise(highp vec2 cell) {
  return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453) - 0.5;
}

float roofJoint(highp float coordinate, float width, float offset) {
  float pixels = fwidth(coordinate);
  float distanceToJoint = abs(fract(coordinate + 0.5 + offset) - 0.5);
  float joint = 1.0 - smoothstep(width, width + 0.7 * pixels + 0.004, distanceToJoint);
  return joint * (1.0 - smoothstep(0.28, 0.82, pixels));
}

vec3 shadeRoof(vec3 color, vec3 normal, highp vec2 metres, vec3 view, bool glazed, float closeDetail) {
  vec3 sunDirection = normalize(vec3(0.55, 0.46, 0.70));
  float sun = max(0.0, dot(normal, sunDirection));
  vec3 lighting = mix(vec3(0.84, 0.88, 0.94), vec3(1.14, 1.10, 1.04), sun);
  if (glazed) {
    // Light metal supports with finer mullions and subdued sky reflections.
    highp vec2 pane = metres / vec2(1.75, 2.4);
    highp float roofBay = metres.x / 7.0;
    float mullion = max(roofJoint(pane.x, 0.023, 0.0), roofJoint(pane.y, 0.021, 0.0));
    float rib = roofJoint(roofBay, 0.022, 0.0);
    float gutter = roofJoint(roofBay, 0.029, -0.026);
    float paneVisibility = 1.0 - smoothstep(0.25, 0.8, length(fwidth(pane)));
    float paneVariation = roofNoise(floor(pane)) * 0.12 * paneVisibility * closeDetail;
    float grazing = 1.0 - max(0.0, dot(normal, view));
    float reflection = 0.055 + 0.22 * pow(grazing, 3.0);
    vec3 glass = mix(color * (1.0 + paneVariation), vec3(0.46, 0.51, 0.55), reflection);
    glass *= 1.0 - gutter * 0.19;
    vec3 frame = mix(vec3(0.44, 0.46, 0.47), vec3(0.71, 0.73, 0.72), sun);
    return mix(glass, frame, max(mullion * 0.69 * closeDetail, rib * 0.88)) * mix(vec3(1.0), lighting, 0.53);
  }

  float pitch = smoothstep(0.12, 0.38, length(normal.xy));
  highp vec2 courses = metres / vec2(0.49, 0.31);
  courses.x += mod(floor(courses.y), 2.0) * 0.5;
  float joint = max(roofJoint(courses.y, 0.032, 0.0), roofJoint(courses.x, 0.023, 0.0) * 0.65);
  float lap = roofJoint(courses.y, 0.037, 0.09);
  float rowsVisible = 1.0 - smoothstep(0.24, 0.83, length(fwidth(courses)));
  float tone = roofNoise(floor(courses)) * rowsVisible * 0.13;
  vec3 pitched = color * (1.0 + (tone - joint * 0.28 + lap * 0.10) * closeDetail);

  highp vec2 grain = metres * 2.5;
  float grainVisibility = 1.0 - smoothstep(0.23, 0.9, length(fwidth(grain)));
  float weathering = roofNoise(floor(metres / 2.3)) * mix(0.016, 0.075, closeDetail);
  vec3 flatFinish = color * (1.0 + weathering + roofNoise(floor(grain)) * grainVisibility * closeDetail * 0.13);
  return mix(flatFinish, pitched, pitch) * lighting;
}

float roofInset(highp vec2 metres, highp vec4 rect) {
  highp vec2 inset = min(metres - rect.xy, rect.zw - metres);
  return min(inset.x, inset.y);
}

vec3 shadePrincesStreetRoof(highp vec2 metres, vec3 normal, float zoomDetail) {
  float sun = clamp(dot(normal, normalize(vec3(0.55, 0.46, 0.70))), 0.0, 1.0);
  vec3 fallback = vec3(0.43, 0.42, 0.40) *
    mix(vec3(0.84, 0.88, 0.94), vec3(1.14, 1.10, 1.04), sun);
  float edge = roofInset(metres, vec4(${roofRect(princesStreetModeledRoofBounds)}));
  float coverage = smoothstep(0.0, 1.3, edge);
  if (coverage == 0.0) return fallback;
  float deck = roofInset(metres, vec4(${roofRect(princesStreetRoofDeck)}));
  float east = smoothstep(0.0, 2.8, metres.x);
  float deckWeight = smoothstep(-0.45, 0.65, deck);
  float slope = length(normal.xy);
  float pitch = smoothstep(0.12, 0.32, slope);
  // Fade fine joints around cliffs, parapets and noisy survey transitions.
  float stableSurface = (1.0 - smoothstep(0.035, 0.17, length(fwidth(normal.xy)))) *
    (1.0 - smoothstep(0.56, 0.83, slope));

  // Dark slate on the smaller roofs and cooler metal along the east mansard.
  highp vec2 slate = metres / vec2(0.53, 0.35);
  slate.x += mod(floor(slate.y), 2.0) * 0.5;
  float rows = roofJoint(slate.y, 0.063, 0.0);
  float joints = roofJoint(slate.x, 0.035, 0.0);
  float lip = roofJoint(slate.y, 0.046, 0.115);
  float tileVisibility = 1.0 - smoothstep(0.27, 0.9, length(fwidth(slate)));
  float tileVariation = roofNoise(floor(slate)) * tileVisibility;
  vec3 slateColor = mix(vec3(0.35, 0.36, 0.37), vec3(0.33, 0.38, 0.43), smoothstep(-22.0, -10.0, metres.x));
  slateColor *= 1.0 + (tileVariation * 0.17 - max(rows, joints * 0.58) * 0.27 + lip * 0.12) *
    zoomDetail * stableSurface;

  highp vec2 seams = metres / vec2(3.1, 0.92);
  float standingSeam = roofJoint(seams.y, 0.046, 0.0);
  float seamEdge = roofJoint(seams.y, 0.036, 0.11);
  float flashing = roofJoint(seams.x, 0.028, 0.0);
  highp vec2 weatherCell = metres / 2.8;
  highp vec2 weatherBase = floor(weatherCell);
  vec2 p = smoothstep(vec2(0.0), vec2(1.0), fract(weatherCell));
  float weather = mix(
    mix(roofNoise(weatherBase), roofNoise(weatherBase + vec2(1.0, 0.0)), p.x),
    mix(roofNoise(weatherBase + vec2(0.0, 1.0)), roofNoise(weatherBase + vec2(1.0)), p.x),
    p.y
  );
  float panel = roofNoise(floor(seams)) *
    (1.0 - smoothstep(0.27, 0.9, length(fwidth(seams))));
  vec3 metal = mix(vec3(0.40, 0.45, 0.50), vec3(0.56, 0.59, 0.61), deckWeight);
  metal *= 1.0 + weather * 0.25 + zoomDetail * stableSurface * (
    panel * 0.14 - max(standingSeam, flashing * 0.55) * 0.24 + seamEdge * 0.13
  );
  vec3 felt = vec3(0.37, 0.39, 0.40) * (1.0 + weather * 0.29);
  vec3 color = mix(mix(felt, slateColor, pitch), metal, east);

  // Draw the surveyed lightwell rims even where the imagery cannot resolve the finish.
  float court = max(
    ${princesStreetRoofCourts.map((rect) => `roofInset(metres, vec4(${roofRect(rect)}))`).join(', ')}
  );
  float rim = (1.0 - smoothstep(0.07, 0.36, abs(court))) * deckWeight;
  float well = smoothstep(-0.03, 0.53, court) * deckWeight;
  color = mix(color, vec3(0.40, 0.43, 0.44), rim * 0.82);
  color *= 1.0 - well * 0.46;
  vec3 light = mix(vec3(0.66, 0.73, 0.82), vec3(1.15, 1.12, 1.06), sun);
  return mix(fallback, color * light, coverage);
}
`;
