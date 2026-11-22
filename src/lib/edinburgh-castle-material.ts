export const castleStoneShader = `
vec3 shadeCastleSurface(float material, highp vec2 metres, highp vec2 site, float light) {
  // Wall courses follow the geometry in metres. Fade the fine joints as
  // they become smaller than a pixel, including while orbiting the site.
  vec3 stone = vec3(0.57, 0.54, 0.47);
  if (material == 1.0) stone = vec3(0.67, 0.55, 0.42);
  if (material == 2.0) stone = vec3(0.69, 0.63, 0.53);
  if (material == 3.0) stone = vec3(0.30, 0.34, 0.36);
  if (material == 4.0) stone = vec3(0.30, 0.25, 0.20);
  if (material == 5.0) stone = vec3(0.30, 0.36, 0.30);
  if (material == 6.0) stone = vec3(0.50, 0.47, 0.41);
  bool slate = material == 3.0;
  vec2 blockSize = slate ? vec2(0.27, 0.41) :
    material == 1.0 ? vec2(0.56, 0.30) : vec2(0.83, 0.36);
  highp vec2 block = metres / blockSize;
  block.x += mod(floor(block.y), 2.0) * 0.5;
  float grain = fract(sin(dot(floor(block), vec2(31.73, 87.41))) * 15731.19);
  highp vec2 seam = min(fract(block), 1.0 - fract(block));
  float mortar = 1.0 - smoothstep(0.014, 0.083, min(seam.x, seam.y));
  float visible = 1.0 - smoothstep(0.18, 0.83, length(fwidth(block)));
  float weather = 0.028 * sin(site.x * 1.9 + site.y * 2.3) +
    0.021 * sin(site.x * 9.1 + metres.y * 0.59);
  float coursing = material == 4.0 || material == 5.0 ? 0.0 : 1.0;
  return stone * light * (1.0 + weather + coursing * visible *
    ((grain - 0.5) * 0.17 - mortar * 0.17));
}
`;
