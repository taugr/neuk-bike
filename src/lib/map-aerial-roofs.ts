import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type FilterSpecification,
  type LngLatLike,
  type Map as LibreMap,
  type MapSourceDataEvent,
} from 'maplibre-gl';
import { terrainSourceId } from './map-terrain';
import {
  collectNearbyBuildingTriangles,
  findClearBuildingBearing,
  parkingCameraOffset,
  registerBuildingSightlines,
  type BuildingTriangle,
  type ParkingSightCamera,
  type SightPoint,
} from './map-building-occlusion';
import { lidarTerrainSourceId } from './waverley-lidar';
import {
  loadRoofSurvey,
  princesStreetSurveyBounds,
  waverleySurveyBounds,
  type RoofSurvey,
} from './waverley-roof-profile';
import {
  buildAerialBuildings,
  materialRoofStride,
  roofDetailTilesInView,
  roofImageryZoom,
  roofTileKey,
  roofTileExtent,
  wallOriginTile,
  type RoofTile,
} from './map-aerial-roof-geometry';
import {
  createShopfrontMatcher,
  storefrontPoiClasses,
  waverleyShoppingStreets,
} from './map-aerial-shopfronts';
import {
  aerialBuildingFilter,
  aerialBuildingsLayerId,
  loadSatelliteTile,
  satelliteProtocol,
  satelliteSourceId,
} from './map-satellite';
import {
  facadePhotoPath,
  roofOutlineStride,
  wallFragmentShader,
  wallVertexStride,
} from './map-aerial-walls';

import { roofMaterialFragmentShader } from './map-aerial-roof-material';
import {
  princesStreetFacadePath,
  princesStreetFacadeZoom,
} from './princes-street-facades';
import {
  princesStreetRoofPhotoBounds,
  princesStreetRoofPhotoRect,
  princesStreetRoofPhotos,
  type PrincesStreetRoofPhotoMode,
} from './princes-street-roof-photo';
import {
  edinburghOverviewFullZoom,
  edinburghCityOverviewMinZoom,
  edinburghCityOverviewFullZoom,
  isLocalEdinburghPilotPreview,
  isLocalModeledFrontagePreview,
  isLocalShadedBuildingsPreview,
  localPrincesStreetRoofPreview,
} from './local-aerial-preview';
import {
  edinburghRoofTilesInView,
  loadEdinburghRoofTile,
  sampleEdinburghRoofTiles,
} from './edinburgh-roof-survey';
import {
  edinburghBuildingIndex,
  edinburghCityOverviewIndex,
  edinburghCityOverviewViewport,
  edinburghMeshViewport,
  edinburghOverviewIndex,
  edinburghOverviewTransition,
  edinburghOverviewViewport,
  loadEdinburghCityMesh,
  loadEdinburghCityOverviewMesh,
  loadEdinburghOverviewMesh,
  selectEdinburghMeshViewport,
} from './edinburgh-buildings';
import {
  edinburghCityOverviewZoom,
  edinburghOverviewChild,
  edinburghOverviewRanges,
  edinburghOverviewZoom,
  type EdinburghOverviewMesh,
  type MeshDrawRange,
} from './edinburgh-overview-mesh';
import {
  edinburghMeshBytes,
  type EdinburghMesh,
  type EdinburghMeshSection,
} from './edinburgh-mesh';

const citySurfaceNames = ['roofs', 'walls', 'outlines'] as const;
type CitySurface = (typeof citySurfaceNames)[number];
const cityMeshCacheBytes = 160 * 1024 * 1024;
const overviewMeshCacheBytes = 96 * 1024 * 1024;
const cityRefreshIntervalMs = 120;
const overviewArrivalMs = 220;
const overviewPreloadZoom = edinburghOverviewFullZoom - 0.25;

const roofLayerId = 'neuk-aerial-roofs';
const roofMinZoom = 16;
// Draw colour swatches at overview zoom. Reveal aerial texture on approach.
const roofDetailStartZoom = 18;
const roofDetailFullZoom = 19.75;
const closeRoofTileZoom = 19;
const facadeTextureKey = 'waverley-facades';
const registeredRoofRect = princesStreetRoofPhotoRect(wallOriginTile);
const vertexSource = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec4 a_wall;
layout(location = 2) in float a_below_eave;
layout(location = 3) in vec4 a_roof_surface;
uniform mat4 u_matrix;
uniform bool u_outline;
uniform highp float u_outline_scale;
uniform bool u_detail_pass;
uniform vec2 u_viewport;
out highp vec2 v_uv;
out highp vec4 v_wall;
out highp vec2 v_roof_metres;
out highp vec4 v_roof_surface;
out highp float v_below_eave;
void main() {
  v_uv = a_position.xy / ${roofTileExtent}.0;
  v_wall = a_wall;
  v_below_eave = a_below_eave;
  v_roof_metres = v_uv * 85.5;
  v_roof_surface = a_roof_surface;
  gl_Position = u_matrix * vec4(a_position, 1.0);
  if (u_detail_pass) gl_Position.z -= 0.000002 * gl_Position.w;
  if (u_outline) {
    highp vec4 next = u_matrix * vec4(a_wall.xyz, 1.0);
    highp vec2 delta = (next.xy / max(next.w, 0.001) -
                        gl_Position.xy / max(gl_Position.w, 0.001)) * u_viewport;
    vec2 perpendicular = vec2(-delta.y, delta.x) / max(length(delta), 0.1);
    // Keep roof edges legible through zoom, tilt and displays of varying density.
    gl_Position.xy += perpendicular * a_wall.w * 3.2 * u_outline_scale / u_viewport * gl_Position.w;
    gl_Position.z -= 0.000006 * gl_Position.w;
  }
}`;
const fragmentSource = `#version 300 es
precision mediump float;
uniform sampler2D u_tile;
uniform sampler2D u_frontage_tile;
uniform sampler2D u_registered_roof;
uniform bool u_frontage_available;
uniform bool u_registered_roof_available;
uniform bool u_registered_roof_detail;
uniform highp vec4 u_registered_roof_rect;
uniform highp vec3 u_roof_tile_to_local;
uniform bool u_wall;
uniform bool u_photo;
uniform bool u_materials;
uniform bool u_shaded_buildings;
uniform bool u_outline;
uniform highp float u_outline_scale;
uniform float u_model_opacity;
uniform float u_overview_opacity;
uniform highp vec3 u_overview_tile;
uniform vec4 u_overview_edges;
uniform bool u_detail_pass;
uniform float u_detail_amount;
uniform vec4 u_detail_uv;
uniform vec3 u_view_direction;
uniform float u_roof_close;
in highp vec2 v_uv;
in highp vec4 v_wall;
in highp vec2 v_roof_metres;
in highp vec4 v_roof_surface;
in highp float v_below_eave;
out vec4 outColor;
const vec3 luminosity = vec3(0.2126, 0.7152, 0.0722);
${wallFragmentShader}
${roofMaterialFragmentShader}
vec4 registeredRoofPhoto(highp vec2 coordinates) {
  if (!u_registered_roof_available) return vec4(0.0);
  highp vec2 uv = (coordinates - u_registered_roof_rect.xy) * u_registered_roof_rect.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThanEqual(uv, vec2(1.0)))) return vec4(0.0);
  return texture(u_registered_roof, uv);
}
void shadeSurface() {
  if (u_outline) {
    float alpha = (1.0 - smoothstep(0.32, 1.0, abs(v_below_eave))) *
                  mix(0.78, 0.24, smoothstep(0.0, 0.75, u_detail_amount)) *
                  u_outline_scale;
    outColor = vec4(vec3(0.16, 0.21, 0.24) * alpha, alpha);
    return;
  }
  if (u_wall) {
    outColor = vec4(shadeWall(v_wall, v_below_eave, u_photo, u_materials, u_detail_amount, v_roof_surface), 1.0);
    return;
  }
  if (u_detail_pass) {
    if (any(lessThan(v_uv, vec2(0.0))) || any(greaterThanEqual(v_uv, vec2(1.0)))) discard;
    highp vec2 detailUv = v_uv * u_detail_uv.z + u_detail_uv.xy;
    vec3 photo = texture(u_tile, detailUv).rgb;
    vec3 averaged = textureLod(u_tile, detailUv, 1.50).rgb;
    float localLight = dot(averaged, luminosity);
    // Apply fine contrast only. The model supplies the material finish and
    // shadows, so broad or overscaled image features do not smear over it.
    float confidence = smoothstep(0.10, 0.32, localLight) * u_detail_uv.w;
    float contrast = dot(photo - averaged, luminosity);
    float alpha = u_detail_amount * confidence *
                  min(0.18, max(0.0, abs(contrast) - 0.025) * 1.48);
    highp vec2 localUv = u_roof_tile_to_local.xy + v_uv * u_roof_tile_to_local.z;
    alpha *= 1.0 - registeredRoofPhoto(localUv).a;
    vec3 detailColour = contrast > 0.0 ? vec3(0.85) : vec3(0.13);
    outColor = vec4(detailColour * alpha, alpha);
    return;
  }
  if (!u_materials) {
    if (any(lessThan(v_uv, vec2(0.0))) || any(greaterThanEqual(v_uv, vec2(1.0)))) discard;
    outColor = texture(u_tile, v_uv);
    return;
  }
  vec2 slope = v_roof_surface.xy;
  vec3 normal = normalize(vec3(slope, sqrt(max(0.001, 1.0 - dot(slope, slope)))));
  vec2 axis = v_roof_surface.zw;
  highp vec2 metres = vec2(dot(v_roof_metres, axis), dot(v_roof_metres, vec2(-axis.y, axis.x)));
  if (u_shaded_buildings && v_wall.w > 2.5) {
    // Choose one base finish over the footprint. Small variations in slope
    // still shade the roof without turning rooftop bumps into material patches.
    float pitch = smoothstep(0.18, 0.55, v_wall.y);
    vec3 deck = vec3(0.47, 0.47, 0.45);
    vec3 slate = vec3(0.33, 0.37, 0.41);
    vec3 finish = mix(deck, slate, pitch) * (1.0 + v_wall.x * 0.09);
    float smoothRoof = 1.0 - smoothstep(0.05, 0.20, length(fwidth(slope)));
    outColor = vec4(shadeRoof(finish, normal, metres, u_view_direction, false, u_roof_close * smoothRoof), 1.0);
    return;
  }
  if (u_shaded_buildings && v_wall.w > 1.5) {
    outColor = vec4(shadePrincesStreetRoof(v_wall.xy, normal, u_roof_close), 1.0);
    return;
  }
  bool glazed = !u_shaded_buildings && v_wall.w > 0.5;
  vec3 color = glazed ? vec3(0.43, 0.44, 0.43) : vec3(0.43, 0.42, 0.40);
  if (u_photo) {
    // Every fragment shares the same interior sample. Lift dark samples so
    // shadows in the aerial photo do not make the entire roof disappear.
    vec3 observed = textureLod(u_tile, v_wall.xy, v_wall.z).rgb;
    float luma = dot(observed, luminosity);
    observed = mix(observed, vec3(luma), glazed ? 0.72 : 0.39);
    float shadowLift = 0.13 * (1.0 - smoothstep(0.11, 0.36, luma));
    color = mix(observed, sqrt(observed), 0.22) + shadowLift;
    color = clamp(color, vec3(0.20), vec3(0.75));
  }
  vec3 shaded = shadeRoof(color, normal, metres, u_view_direction, glazed, u_shaded_buildings ? 0.0 : u_roof_close);
  vec4 registered = registeredRoofPhoto(v_uv);
  // The photograph already contains directional light. Use only a little
  // additional relief so it stays readable as the viewer tilts the map.
  float relief = clamp(dot(normal, normalize(vec3(-0.35, -0.45, 0.82))), 0.0, 1.0);
  float exposure = mix(1.06, 0.82, smoothstep(0.24, 0.72, dot(registered.rgb, luminosity)));
  vec3 photographic = registered.rgb * exposure * mix(0.94, 1.04, relief);
  if (u_registered_roof_detail) {
    // Adjacent roofs provide photographic contrast. Only the calibrated deck
    // supplies full colour, so incomplete coverage does not cast seams.
    vec3 detail = shaded + (registered.rgb - vec3(128.0 / 255.0)) * 1.25;
    photographic = mix(detail, photographic, smoothstep(0.68, 0.92, registered.a));
  }
  outColor = vec4(mix(shaded, photographic, registered.a), 1.0);
}
void main() {
  shadeSurface();
  float opacity = u_model_opacity;
  if (u_overview_tile.z > 0.0) {
    highp vec2 tile = (v_uv - u_overview_tile.xy) * u_overview_tile.z;
    vec4 distances = clamp(vec4(tile, 1.0 - tile), 0.0, 1.0);
    vec4 fade = mix(vec4(1.0), smoothstep(vec4(0.0), vec4(0.16), distances), u_overview_edges);
    opacity *= u_overview_opacity * min(min(fade.x, fade.y), min(fade.z, fade.w));
  }
  if (opacity < 0.004) discard;
  outColor *= opacity;
}`;

function createProgram(gl: WebGL2RenderingContext) {
  const program = gl.createProgram();
  if (!program) return null;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertexSource],
    [gl.FRAGMENT_SHADER, fragmentSource],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) {
      gl.deleteProgram(program);
      return null;
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn(
        'Unable to compile the aerial building shader:',
        gl.getShaderInfoLog(shader),
      );
      gl.deleteShader(shader);
      gl.deleteProgram(program);
      return null;
    }
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn(
      'Unable to draw aerial buildings:',
      gl.getProgramInfoLog(program),
    );
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function loadedBuildingFootprints(map: LibreMap, paddingRatio = 0.35) {
  const { clientWidth, clientHeight } = map.getCanvas();
  // Include the blocks just outside the screen ahead of the next small pan.
  // Query the rendered tile pyramid so overlapping fallback tiles keep
  // MapLibre's usual feature selection.
  const padding = Math.min(clientWidth, clientHeight) * paddingRatio;
  return map.queryRenderedFeatures(
    [
      [-padding, -padding],
      [clientWidth + padding, clientHeight + padding],
    ],
    { layers: [aerialBuildingsLayerId] },
  );
}

function loadedShopfronts(map: LibreMap) {
  return createShopfrontMatcher(
    map.querySourceFeatures('openmaptiles', {
      sourceLayer: 'transportation_name',
      filter: ['in', ['get', 'name'], ['literal', waverleyShoppingStreets]],
    }),
    map.querySourceFeatures('openmaptiles', {
      sourceLayer: 'poi',
      filter: ['in', ['get', 'class'], ['literal', storefrontPoiClasses]],
    }),
  );
}

type RoofBatch = {
  tile: Pick<RoofTile, 'x' | 'y' | 'z'>;
  length: number;
  buffer: WebGLBuffer;
};
type SurfaceBuffer = { buffer: WebGLBuffer; count: number };
type IndexedSurfaceBuffer = SurfaceBuffer & {
  indexBuffer: WebGLBuffer;
  indexType: GLenum;
  ranges?: MeshDrawRange[];
  overview?: OverviewDraw;
};
type OverviewDraw = {
  tile: [number, number, number];
  edges: [number, number, number, number];
  ranges?: Partial<Record<CitySurface, MeshDrawRange[]>>;
  arrivedAt?: number;
};
type CityMeshBuffers = Partial<Record<CitySurface, IndexedSurfaceBuffer>>;

class AerialRoofs implements CustomLayerInterface {
  readonly id = roofLayerId;
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  private map!: LibreMap;
  private gl!: WebGL2RenderingContext;
  private initialized = false;
  private program: WebGLProgram | null = null;
  private matrixLocation: WebGLUniformLocation | null = null;
  private wallLocation: WebGLUniformLocation | null = null;
  private materialsLocation: WebGLUniformLocation | null = null;
  private shadedBuildingsLocation: WebGLUniformLocation | null = null;
  private outlineLocation: WebGLUniformLocation | null = null;
  private outlineScaleLocation: WebGLUniformLocation | null = null;
  private opacityLocation: WebGLUniformLocation | null = null;
  private overviewOpacityLocation: WebGLUniformLocation | null = null;
  private overviewTileLocation: WebGLUniformLocation | null = null;
  private overviewEdgesLocation: WebGLUniformLocation | null = null;
  private overviewFade = 0;
  private frameTime = 0;
  private detailPassLocation: WebGLUniformLocation | null = null;
  private detailAmountLocation: WebGLUniformLocation | null = null;
  private detailUvLocation: WebGLUniformLocation | null = null;
  private roofViewLocation: WebGLUniformLocation | null = null;
  private roofCloseLocation: WebGLUniformLocation | null = null;
  private viewportLocation: WebGLUniformLocation | null = null;
  private photoLocation: WebGLUniformLocation | null = null;
  private frontageTileLocation: WebGLUniformLocation | null = null;
  private frontageAvailableLocation: WebGLUniformLocation | null = null;
  private registeredRoofLocation: WebGLUniformLocation | null = null;
  private registeredRoofAvailableLocation: WebGLUniformLocation | null = null;
  private registeredRoofDetailLocation: WebGLUniformLocation | null = null;
  private registeredRoofRectLocation: WebGLUniformLocation | null = null;
  private roofTileToLocalLocation: WebGLUniformLocation | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private fallbackTexture: WebGLTexture | null = null;
  private walls: {
    buffer: WebGLBuffer | null;
    count: number;
    includesPhoto: boolean;
    includesFrontage: boolean;
  } | null = null;
  private materialRoofs = new Map<string, RoofBatch>();
  private outlines: SurfaceBuffer | null = null;
  private batches = new Map<string, RoofBatch>();
  private textures = new Map<string, WebGLTexture | null>();
  private pendingImages = new Map<string, ImageBitmap>();
  private visibleDetailTiles = new Set<string>();
  private imagery = new AbortController();
  private pendingSurfaces: ReturnType<typeof buildAerialBuildings> | null =
    null;
  private showingMaterials = false;
  private visibleRegisteredRoofPath?: string;
  private survey?: RoofSurvey;
  private fineSurvey?: RoofSurvey;
  private fineSurveyRequested = false;
  private surveyRequest = new AbortController();
  private pilotTiles = new Map<
    string,
    Awaited<ReturnType<typeof loadEdinburghRoofTile>>
  >();
  private pilotRequests = new Set<string>();
  private cityIndex?: Awaited<ReturnType<typeof edinburghBuildingIndex>>;
  private overviewIndex?: Awaited<ReturnType<typeof edinburghOverviewIndex>>;
  private cityOverviewIndex?: Awaited<
    ReturnType<typeof edinburghCityOverviewIndex>
  >;
  private cityMeshes = new Map<string, EdinburghMesh>();
  private overviewMeshes = new Map<string, EdinburghOverviewMesh>();
  private cityOverviewMeshes = new Map<string, EdinburghOverviewMesh>();
  private overviewDraw = new Map<EdinburghMesh, OverviewDraw>();
  private cityGpuMeshes = new Map<EdinburghMesh, CityMeshBuffers>();
  private cityRequests = new Set<string>();
  private cityMissing = new Set<string>();
  private overviewMissing = new Set<string>();
  private cityOverviewMissing = new Set<string>();
  private displayedOverview: string[] = [];
  private displayedCityOverview: string[] = [];
  private citySignature = '';
  private lastCityRefresh = -Infinity;
  private cityView?: ReturnType<typeof edinburghMeshViewport>;
  private pendingCityMeshes?: EdinburghMesh[];
  private removeBuildingSightlines?: () => void;

  constructor(
    private readonly lidar: boolean,
    private readonly shadedBuildings: boolean,
    private readonly modeledFrontage: boolean,
    private readonly edinburghPilot: boolean,
    private readonly edinburghCity: boolean,
    private readonly registeredRoofMode?: PrincesStreetRoofPhotoMode,
  ) {}
  private dirty = true;

  onAdd(map: LibreMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.gl = gl;
    map.on('moveend', this.invalidate);
    map.on('resize', this.invalidate);
    map.on('sourcedata', this.onSourceData);
    map.on('idle', this.refresh);
    map.on('webglcontextrestored', this.restoreContext);
    if (this.edinburghCity) {
      this.removeBuildingSightlines = registerBuildingSightlines(
        map,
        this.findParkingRevealBearing,
      );
      map.on('move', this.invalidate);
      map.on('render', this.refreshCityFrame);
      const { signal } = this.surveyRequest;
      void edinburghBuildingIndex()
        .then((index) => {
          if (signal.aborted) return;
          this.cityIndex = index;
          // Keep native buildings beyond the survey. Within Edinburgh, wait
          // for our meshes rather than drawing a different solid in their place.
          if (map.getLayer(aerialBuildingsLayerId)) {
            map.setFilter(aerialBuildingsLayerId, [
              'all',
              aerialBuildingFilter,
              ['>', ['distance', index.boundary], 0],
            ] as FilterSpecification);
            map.setLayoutProperty(
              aerialBuildingsLayerId,
              'visibility',
              'visible',
            );
          }
          this.invalidate();
          map.triggerRepaint();
        })
        .catch((error: unknown) => {
          if (!signal.aborted)
            console.warn('Unable to load Edinburgh buildings.', error);
        });
      void edinburghOverviewIndex()
        .then((index) => {
          if (signal.aborted) return;
          this.overviewIndex = index;
          this.invalidate();
          map.triggerRepaint();
        })
        .catch((error: unknown) => {
          if (!signal.aborted)
            console.warn('Unable to load Edinburgh overview buildings.', error);
        });
      void edinburghCityOverviewIndex()
        .then((index) => {
          if (signal.aborted) return;
          this.cityOverviewIndex = index;
          this.invalidate();
          map.triggerRepaint();
        })
        .catch((error: unknown) => {
          if (!signal.aborted)
            console.warn('Unable to load Edinburgh city overview.', error);
        });
    } else if (this.lidar && !this.edinburghPilot) {
      const { signal } = this.surveyRequest;
      void loadRoofSurvey(signal)
        .then((survey) => {
          if (signal.aborted) return;
          this.survey = survey;
          this.invalidate();
          map.triggerRepaint();
        })
        .catch((error: unknown) => {
          if (!signal.aborted)
            console.warn('Unable to load Waverley roof survey.', error);
        });
    }
  }

  private invalidate = () => {
    this.dirty = true;
  };

  private refreshCityFrame = () => {
    if (
      this.dirty &&
      performance.now() - this.lastCityRefresh >= cityRefreshIntervalMs
    )
      this.refresh();
  };

  private findParkingRevealBearing = (
    location: LngLatLike,
    height: number,
    camera: ParkingSightCamera,
  ) => {
    const { map } = this;
    if (!this.cityGpuMeshes.size) return;
    const scale = 2 ** wallOriginTile.z * roofTileExtent;
    const parking = MercatorCoordinate.fromLngLat(location);
    const groundHeight = map.queryTerrainElevation(location);
    if (groundHeight == null) return;
    const target: SightPoint = [
      parking.x * scale - wallOriginTile.x * roofTileExtent,
      parking.y * scale - wallOriginTile.y * roofTileExtent,
      groundHeight + height,
    ];
    const fov = (map.getVerticalFieldOfView() * Math.PI) / 180;
    const cameraDistance =
      map.getCanvas().clientHeight / (2 * Math.tan(fov / 2));
    const worldSize = 512 * 2 ** camera.zoom;
    const [east, south, altitude] = parkingCameraOffset(camera, cameraDistance);
    const eye: SightPoint = [
      target[0] + (east * scale) / worldSize,
      target[1] + (south * scale) / worldSize,
      groundHeight +
        altitude / (worldSize * parking.meterInMercatorCoordinateUnits()),
    ];
    const radius = Math.hypot(eye[0] - target[0], eye[1] - target[1]);
    const triangles: BuildingTriangle[] = [];
    for (const mesh of this.cityGpuMeshes.keys()) {
      const drawnRanges = this.overviewDraw.get(mesh)?.ranges;
      for (const [name, stride] of [
        ['roofs', materialRoofStride],
        ['walls', wallVertexStride],
      ] as const) {
        const { vertices, indices } = mesh[name];
        for (const { first, count } of drawnRanges?.[name] ?? [
          { first: 0, count: indices.length },
        ])
          collectNearbyBuildingTriangles(
            triangles,
            vertices,
            indices,
            stride,
            target,
            radius,
            first,
            count,
          );
      }
    }
    return findClearBuildingBearing(target, eye, camera.bearing, triangles);
  };

  private onSourceData = (event: MapSourceDataEvent) => {
    if (
      event.sourceId === 'openmaptiles' ||
      event.sourceId === terrainSourceId ||
      event.sourceId === lidarTerrainSourceId
    ) {
      this.invalidate();
    }
  };

  private restoreContext = () => {
    this.initialized = false;
    this.program = null;
    this.vao = null;
    this.fallbackTexture = null;
    this.walls = null;
    this.materialRoofs.clear();
    this.cityGpuMeshes.clear();
    this.outlines = null;
    this.batches.clear();
    this.imagery.abort();
    this.imagery = new AbortController();
    this.textures.clear();
    for (const image of this.pendingImages.values()) image.close();
    this.pendingImages.clear();
    this.citySignature = 'restoring';
    this.invalidate();
  };

  private requestCityTiles<T>(
    keys: string[],
    cache: Map<string, T>,
    missing: Set<string>,
    type: 'detail' | 'overview' | 'city-overview',
    load: (key: string, signal: AbortSignal) => Promise<T>,
    parallelLimit = 6,
  ) {
    let inFlight = [...this.cityRequests].filter((key) =>
      key.startsWith(`${type}/`),
    ).length;
    for (const key of keys) {
      if (this.cityRequests.size >= 6 || inFlight >= parallelLimit) break;
      const request = `${type}/${key}`;
      if (cache.has(key) || missing.has(key) || this.cityRequests.has(request))
        continue;
      this.cityRequests.add(request);
      inFlight++;
      const { signal } = this.surveyRequest;
      void load(key, signal)
        .then((mesh) => {
          if (!signal.aborted) cache.set(key, mesh);
        })
        .catch((error: unknown) => {
          if (signal.aborted) return;
          missing.add(key);
          console.warn(
            `Unable to load Edinburgh ${type} building mesh.`,
            error,
          );
        })
        .finally(() => {
          this.cityRequests.delete(request);
          if (signal.aborted) return;
          this.invalidate();
          this.map.triggerRepaint();
        });
    }
  }

  private appendOverviewMeshes(
    meshes: EdinburghMesh[],
    keys: string[],
    cache: Map<string, EdinburghOverviewMesh>,
    covered: ReadonlyMap<string, number>,
    zoom: number,
    previousDraw: ReadonlyMap<EdinburghMesh, OverviewDraw>,
    fadeIn: (key: string) => boolean,
    neighbourDrawn?: (key: string) => boolean,
  ) {
    const present = new Set(keys);
    const edge = (key: string) =>
      Number(!present.has(key) && !neighbourDrawn?.(key));
    const scale = 2 ** (wallOriginTile.z - zoom);
    let triangles = 0;
    for (const key of keys) {
      const overview = cache.get(key)!;
      const mask = covered.get(key) ?? 0;
      const roofs = edinburghOverviewRanges(overview.roofEnds, mask);
      const walls = edinburghOverviewRanges(overview.wallEnds, mask);
      const count = [...roofs, ...walls].reduce(
        (sum, range) => sum + range.count / 3,
        0,
      );
      if (count) {
        const [x, y] = key.split('/').map(Number);
        meshes.push(overview.mesh);
        triangles += count;
        this.overviewDraw.set(overview.mesh, {
          tile: [
            x * scale - wallOriginTile.x,
            y * scale - wallOriginTile.y,
            1 / scale,
          ],
          edges: [
            edge(`${x - 1}/${y}`),
            edge(`${x}/${y - 1}`),
            edge(`${x + 1}/${y}`),
            edge(`${x}/${y + 1}`),
          ],
          ranges: mask ? { roofs, walls } : undefined,
          arrivedAt: previousDraw.has(overview.mesh)
            ? previousDraw.get(overview.mesh)?.arrivedAt
            : fadeIn(key)
              ? performance.now()
              : undefined,
        });
      }
      cache.delete(key);
      cache.set(key, overview);
    }
    return triangles;
  }

  private trimOverviewCache(
    cache: Map<string, EdinburghOverviewMesh>,
    keep: string[],
  ) {
    let remaining = [...cache.values()].reduce(
      (bytes, { mesh }) => bytes + edinburghMeshBytes(mesh),
      0,
    );
    for (const [key, { mesh }] of cache) {
      if (remaining <= overviewMeshCacheBytes) break;
      if (keep.includes(key)) continue;
      cache.delete(key);
      remaining -= edinburghMeshBytes(mesh);
    }
  }

  private refreshCity() {
    this.lastCityRefresh = performance.now();
    const { map, cityIndex, overviewIndex, cityOverviewIndex } = this;
    const zoom = map.getZoom();
    const active =
      cityIndex &&
      zoom >= edinburghCityOverviewMinZoom &&
      map.getTerrain()?.source === lidarTerrainSourceId;
    const bounds = map.getBounds();
    const center = MercatorCoordinate.fromLngLat(map.getCenter());
    const wantsDetail = active && zoom >= roofMinZoom;
    const preloadOverview =
      active && zoom >= overviewPreloadZoom && overviewIndex
        ? edinburghOverviewViewport(bounds, center, overviewIndex)
        : [];
    const overviewKeys =
      zoom >= edinburghOverviewFullZoom ? preloadOverview : [];
    const cityParent = (key: string) => {
      const [x, y] = key.split('/').map(Number);
      return edinburghOverviewChild(
        x,
        y,
        edinburghOverviewZoom,
        edinburghCityOverviewZoom,
      );
    };
    // Let a loaded city mesh cover its neighbourhood until the finer mesh arrives.
    const coveredNeighbourhoods = new Set(
      overviewKeys.filter(
        (key) =>
          this.overviewMeshes.has(key) ||
          (!this.overviewMissing.has(key) &&
            !this.cityOverviewMeshes.has(cityParent(key).parent)),
      ),
    );
    const cityKeys =
      active && cityOverviewIndex
        ? edinburghCityOverviewViewport(
            bounds,
            center,
            cityOverviewIndex,
            overviewIndex,
            coveredNeighbourhoods,
          )
        : [];
    const requested = wantsDetail
      ? edinburghMeshViewport(bounds, center, cityIndex.tiles)
      : undefined;
    const nearest = wantsDetail
      ? edinburghMeshViewport(bounds, center, cityIndex.tiles, 0)
      : undefined;
    this.requestCityTiles(
      cityKeys,
      this.cityOverviewMeshes,
      this.cityOverviewMissing,
      'city-overview',
      loadEdinburghCityOverviewMesh,
      2,
    );
    this.requestCityTiles(
      preloadOverview,
      this.overviewMeshes,
      this.overviewMissing,
      'overview',
      loadEdinburghOverviewMesh,
      wantsDetail ? 3 : cityKeys.length ? 4 : 6,
    );
    this.requestCityTiles(
      requested?.tiles ?? [],
      this.cityMeshes,
      this.cityMissing,
      'detail',
      loadEdinburghCityMesh,
    );
    const awaitingOverview = overviewKeys.some(
      (key) => !this.overviewMeshes.has(key) && !this.overviewMissing.has(key),
    );
    const awaitingCity = cityKeys.some(
      (key) =>
        !this.cityOverviewMeshes.has(key) && !this.cityOverviewMissing.has(key),
    );
    // Keep the previous meshes until a wider view has something to replace them with.
    const view =
      active && !wantsDetail && (awaitingOverview || awaitingCity)
        ? this.cityView
        : selectEdinburghMeshViewport(
            requested,
            nearest,
            this.cityView,
            this.cityMeshes,
            this.cityMissing,
          );
    const visibleCity = cityOverviewIndex
      ? edinburghOverviewTransition(
          cityKeys,
          this.displayedCityOverview,
          this.cityOverviewMeshes,
          this.cityOverviewMissing,
          bounds,
          cityOverviewIndex,
          edinburghCityOverviewZoom,
        )
      : [];
    const cityPresent = new Set(visibleCity);
    const visibleOverview = overviewIndex
      ? edinburghOverviewTransition(
          overviewKeys,
          this.displayedOverview,
          this.overviewMeshes,
          this.overviewMissing,
          bounds,
          overviewIndex,
          edinburghOverviewZoom,
        )
      : [];
    if (active && awaitingCity && !overviewKeys.length) {
      for (const key of this.displayedOverview) {
        const parent = cityParent(key).parent;
        if (cityKeys.includes(parent) && !cityPresent.has(parent))
          visibleOverview.push(key);
      }
    }
    const overviewPresent = new Set(visibleOverview);
    const detailKeys = (view?.tiles ?? []).filter((key) => {
      const [x, y] = key.split('/').map(Number);
      const { parent } = edinburghOverviewChild(x, y);
      // Do not draw retained detail over a city mesh with no neighbourhood
      // mesh to take ownership of that child.
      return (
        overviewPresent.has(parent) ||
        !cityPresent.has(cityParent(parent).parent)
      );
    });

    let cacheBytes = [...this.cityMeshes.values()].reduce(
      (bytes, mesh) => bytes + edinburghMeshBytes(mesh),
      0,
    );
    for (const [key, mesh] of this.cityMeshes) {
      if (this.cityMeshes.size <= 60 && cacheBytes <= cityMeshCacheBytes) break;
      if (requested?.tiles.includes(key) || view?.tiles.includes(key)) continue;
      this.cityMeshes.delete(key);
      cacheBytes -= edinburghMeshBytes(mesh);
    }
    this.trimOverviewCache(this.overviewMeshes, [
      ...preloadOverview,
      ...visibleOverview,
    ]);
    this.trimOverviewCache(this.cityOverviewMeshes, [
      ...cityKeys,
      ...visibleCity,
    ]);

    const signature = [
      detailKeys.join(','),
      visibleOverview.slice().sort().join(','),
      visibleCity.slice().sort().join(','),
    ].join('|');
    if (signature === this.citySignature) return;
    this.citySignature = signature;
    const detailMeshes = detailKeys.map((key) => this.cityMeshes.get(key)!);
    const covered = new Map<string, number>();
    for (const key of detailKeys) {
      const [x, y] = key.split('/').map(Number);
      const { parent, slot } = edinburghOverviewChild(x, y);
      covered.set(parent, (covered.get(parent) ?? 0) | (1 << slot));
    }
    const cityCovered = new Map<string, number>();
    for (const key of visibleOverview) {
      const { parent, slot } = cityParent(key);
      cityCovered.set(parent, (cityCovered.get(parent) ?? 0) | (1 << slot));
    }
    const previousDraw = this.overviewDraw;
    const previousCity = new Set(this.displayedCityOverview);
    const previousNeighbourhoods = new Set(this.displayedOverview);
    for (const key of this.cityView?.tiles ?? []) {
      const [x, y] = key.split('/').map(Number);
      previousNeighbourhoods.add(edinburghOverviewChild(x, y).parent);
    }
    const previousCityCoverage = new Set(
      [...previousNeighbourhoods].map((key) => cityParent(key).parent),
    );
    const animate = !window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches;
    this.cityView = view;
    this.displayedOverview = visibleOverview;
    this.displayedCityOverview = visibleCity;
    this.overviewDraw = new Map();
    const meshes = [...detailMeshes];
    const overviewTriangles = this.appendOverviewMeshes(
      meshes,
      visibleOverview,
      this.overviewMeshes,
      covered,
      edinburghOverviewZoom,
      previousDraw,
      (key) =>
        animate &&
        !previousNeighbourhoods.has(key) &&
        !previousCity.has(cityParent(key).parent),
      (key) => cityPresent.has(cityParent(key).parent),
    );
    const cityTriangles = this.appendOverviewMeshes(
      meshes,
      visibleCity,
      this.cityOverviewMeshes,
      cityCovered,
      edinburghCityOverviewZoom,
      previousDraw,
      (key) => animate && !previousCityCoverage.has(key),
    );

    this.pendingCityMeshes = meshes;
    this.setMaterialsActive(meshes.length > 0);
    const { dataset } = map.getContainer();
    if (visibleCity.length) {
      dataset.mapEdinburghCityOverviewTiles = String(visibleCity.length);
      dataset.mapEdinburghCityOverviewTriangles = String(cityTriangles);
      dataset.mapEdinburghCityOverviewBytes = String(
        visibleCity.reduce(
          (sum, key) => sum + cityOverviewIndex![key].bytes,
          0,
        ),
      );
    } else {
      delete dataset.mapEdinburghCityOverviewTiles;
      delete dataset.mapEdinburghCityOverviewTriangles;
      delete dataset.mapEdinburghCityOverviewBytes;
    }
    if (visibleOverview.length) {
      dataset.mapEdinburghOverviewTiles = String(visibleOverview.length);
      dataset.mapEdinburghOverviewTriangles = String(overviewTriangles);
      dataset.mapEdinburghOverviewBytes = String(
        visibleOverview.reduce(
          (sum, key) => sum + overviewIndex![key].bytes,
          0,
        ),
      );
    } else {
      delete dataset.mapEdinburghOverviewTiles;
      delete dataset.mapEdinburghOverviewTriangles;
      delete dataset.mapEdinburghOverviewBytes;
    }
    if (detailMeshes.length) {
      dataset.mapEdinburghMeshTiles = String(detailMeshes.length);
      dataset.mapEdinburghBuildings = String(
        detailMeshes.reduce((sum, mesh) => sum + mesh.buildings, 0),
      );
      dataset.mapLidarBuildings = String(
        detailMeshes.reduce((sum, mesh) => sum + mesh.surveyed, 0),
      );
      for (const key of detailKeys) {
        const mesh = this.cityMeshes.get(key)!;
        this.cityMeshes.delete(key);
        this.cityMeshes.set(key, mesh);
      }
    } else {
      delete dataset.mapEdinburghMeshTiles;
      delete dataset.mapEdinburghBuildings;
      delete dataset.mapLidarBuildings;
    }
    if (!meshes.length) delete dataset.mapEdinburghMeshUploadMs;
    map.triggerRepaint();
  }

  private refresh = () => {
    if (!this.dirty || !this.map.getLayer(aerialBuildingsLayerId)) return;
    this.dirty = false;
    const { gl, map } = this;
    if (gl.isContextLost()) return;
    if (this.edinburghCity) {
      this.refreshCity();
      return;
    }
    const bounds = map.getBounds();
    const zoom = map.getZoom();
    const buildingImagery = !this.shadedBuildings;
    const closeDetail =
      buildingImagery && this.lidar && zoom >= roofDetailStartZoom;
    const imageryZoom =
      zoom >= closeRoofTileZoom ? closeRoofTileZoom : roofImageryZoom;
    const surveyedTerrain = map.getTerrain()?.source === lidarTerrainSourceId;
    const pilotTiles =
      this.edinburghPilot && surveyedTerrain && zoom >= roofMinZoom
        ? edinburghRoofTilesInView(bounds)
        : [];
    const pilotSurvey = new Map<
      string,
      Awaited<ReturnType<typeof loadEdinburghRoofTile>>
    >();
    for (const key of pilotTiles) {
      const tile = this.pilotTiles.get(key);
      if (tile) {
        pilotSurvey.set(key, tile);
        // Keep recently used tiles at the end of the cache.
        this.pilotTiles.delete(key);
        this.pilotTiles.set(key, tile);
      } else if (!this.pilotRequests.has(key)) {
        this.pilotRequests.add(key);
        const { signal } = this.surveyRequest;
        void loadEdinburghRoofTile(key, signal)
          .then((data) => {
            if (signal.aborted) return;
            this.pilotTiles.set(key, data);
            if (this.pilotTiles.size > 24) {
              const oldest = this.pilotTiles.keys().next().value;
              if (oldest !== undefined) {
                this.pilotTiles.delete(oldest);
                this.pilotRequests.delete(oldest);
              }
            }
            this.invalidate();
            map.triggerRepaint();
          })
          .catch((error: unknown) => {
            if (!signal.aborted)
              console.warn('Unable to load Edinburgh roof tile.', error);
          });
      }
    }
    const nearSurvey = this.edinburghPilot
      ? pilotSurvey.size > 0
      : bounds.intersects(waverleySurveyBounds);
    const survey = !surveyedTerrain
      ? undefined
      : this.edinburghPilot
        ? sampleEdinburghRoofTiles(pilotSurvey)
        : this.survey;
    const nearRoofDetail =
      !!survey &&
      !this.edinburghPilot &&
      this.shadedBuildings &&
      zoom >= roofDetailStartZoom &&
      bounds.intersects(princesStreetSurveyBounds);
    if (nearRoofDetail && !this.fineSurveyRequested) {
      this.fineSurveyRequested = true;
      const { signal } = this.surveyRequest;
      void loadRoofSurvey(signal, true)
        .then((data) => {
          if (signal.aborted) return;
          this.fineSurvey = data;
          this.invalidate();
          map.triggerRepaint();
        })
        .catch((error: unknown) => {
          if (!signal.aborted)
            console.warn('Unable to load Princes Street roof detail.', error);
        });
    }
    const buildStartedAt = pilotSurvey.size ? performance.now() : undefined;
    this.pendingSurfaces =
      map.getZoom() >= roofMinZoom && (!this.lidar || nearSurvey)
        ? buildAerialBuildings(
            this.lidar
              ? loadedBuildingFootprints(
                  map,
                  this.edinburghPilot ? 0.12 : undefined,
                )
              : map.queryRenderedFeatures({ layers: [aerialBuildingsLayerId] }),
            (location) => map.queryTerrainElevation(location),
            {
              survey,
              fineSurvey: nearRoofDetail ? this.fineSurvey : undefined,
              materials: this.lidar,
              edinburghPilot: this.edinburghPilot
                ? zoom >= roofDetailStartZoom
                  ? 'detail'
                  : 'overview'
                : undefined,
              shopfront:
                buildingImagery && this.lidar && survey
                  ? loadedShopfronts(map)
                  : undefined,
              photoFrontage:
                buildingImagery && !!survey && zoom >= princesStreetFacadeZoom,
              photoGate: buildingImagery,
              modeledFrontage: nearRoofDetail && this.modeledFrontage,
              registeredRoof:
                nearSurvey && bounds.intersects(princesStreetRoofPhotoBounds)
                  ? this.registeredRoofMode
                  : undefined,
              detailTiles: closeDetail
                ? roofDetailTilesInView(bounds, imageryZoom)
                : undefined,
            },
          )
        : {
            roofs: new Map<string, RoofTile>(),
            walls: [],
            materialRoofs: new Map<string, RoofTile>(),
            outlines: [],
            includesPhoto: false,
            includesFrontage: false,
            measuredBuildings: 0,
            detailedBuildings: 0,
            measuredBands: 0,
            modeledOpenings: 0,
            historicBuildings: { 'old-town': 0, 'new-town': 0 },
            historicOpenings: { 'old-town': 0, 'new-town': 0 },
            modeledRoofs: 0,
            generatedBuildings: 0,
            shopfrontSegments: 0,
          };
    const {
      measuredBuildings,
      detailedBuildings,
      measuredBands,
      modeledOpenings,
      modeledRoofs,
      generatedBuildings,
      shopfrontSegments,
    } = this.pendingSurfaces;
    const { dataset } = map.getContainer();
    this.setMaterialsActive(this.pendingSurfaces.materialRoofs.size > 0);
    if (measuredBuildings)
      dataset.mapLidarBuildings = String(measuredBuildings);
    else delete dataset.mapLidarBuildings;
    if (detailedBuildings)
      dataset.mapDetailedLidarBuildings = String(detailedBuildings);
    else delete dataset.mapDetailedLidarBuildings;
    if (measuredBands) dataset.mapLidarFacadeBands = String(measuredBands);
    else delete dataset.mapLidarFacadeBands;
    if (modeledOpenings)
      dataset.mapModeledFacadeOpenings = String(modeledOpenings);
    else delete dataset.mapModeledFacadeOpenings;
    if (modeledRoofs) dataset.mapModeledRoofMaterials = String(modeledRoofs);
    else delete dataset.mapModeledRoofMaterials;
    if (buildStartedAt !== undefined) {
      dataset.mapEdinburghRoofTiles = String(pilotSurvey.size);
      dataset.mapEdinburghBuildings = String(generatedBuildings);
      dataset.mapEdinburghMeshMs = String(
        Math.round(performance.now() - buildStartedAt),
      );
    } else {
      delete dataset.mapEdinburghRoofTiles;
      delete dataset.mapEdinburghBuildings;
      delete dataset.mapEdinburghMeshMs;
    }
    if (shopfrontSegments)
      dataset.mapShopfrontSegments = String(shopfrontSegments);
    else delete dataset.mapShopfrontSegments;
    this.visibleDetailTiles = new Set(this.pendingSurfaces.roofs.keys());
    // Keep only the close-detail textures used by this view. The lower-level
    // tiles also provide colour samples and are shared across nearby roofs.
    for (const [key, texture] of this.textures) {
      if (
        !key.startsWith(`${closeRoofTileZoom}/`) ||
        this.visibleDetailTiles.has(key)
      )
        continue;
      const pending = this.pendingImages.get(key);
      if (!texture && !pending) continue;
      pending?.close();
      this.pendingImages.delete(key);
      gl.deleteTexture(texture);
      this.textures.delete(key);
    }
    if (buildingImagery) {
      for (const { x, y, z } of [
        ...this.pendingSurfaces.roofs.values(),
        ...this.pendingSurfaces.materialRoofs.values(),
      ]) {
        this.requestRoofTile(x, y, z);
      }
    }
    if (this.pendingSurfaces.includesPhoto)
      this.requestSurfacePhoto(facadeTextureKey, facadePhotoPath);
    if (this.pendingSurfaces.includesFrontage)
      this.requestSurfacePhoto(
        princesStreetFacadePath,
        princesStreetFacadePath,
      );
    this.visibleRegisteredRoofPath =
      this.registeredRoofMode &&
      survey &&
      closeDetail &&
      this.pendingSurfaces.includesFrontage &&
      bounds.intersects(princesStreetRoofPhotoBounds)
        ? princesStreetRoofPhotos[this.registeredRoofMode].path
        : undefined;
    if (this.visibleRegisteredRoofPath)
      this.requestSurfacePhoto(
        this.visibleRegisteredRoofPath,
        this.visibleRegisteredRoofPath,
      );
    map.triggerRepaint();
  };

  private requestSurfacePhoto(key: string, path: string) {
    if (this.textures.has(key)) return;
    void this.requestTexture(key, async ({ signal }) => {
      const response = await fetch(path, { signal });
      if (!response.ok) throw new Error(`Surface photo: ${response.status}`);
      return response.blob();
    });
  }

  private uploadSurfaces(
    gl: WebGL2RenderingContext,
    {
      roofs,
      walls,
      materialRoofs,
      outlines,
      includesPhoto,
      includesFrontage,
    }: ReturnType<typeof buildAerialBuildings>,
  ) {
    this.uploadRoofs(gl, this.batches, roofs);
    this.uploadRoofs(gl, this.materialRoofs, materialRoofs);
    gl.deleteBuffer(this.walls?.buffer ?? null);
    this.walls = null;
    if (walls.length) {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(walls), gl.STATIC_DRAW);
      this.walls = {
        buffer,
        count: walls.length / wallVertexStride,
        includesPhoto,
        includesFrontage,
      };
    }
    this.outlines = this.uploadBuffer(
      gl,
      this.outlines,
      outlines,
      roofOutlineStride,
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private uploadRoofs(
    gl: WebGL2RenderingContext,
    batches: Map<string, RoofBatch>,
    tiles: Map<string, RoofTile>,
  ) {
    for (const [key, { buffer }] of batches) {
      if (tiles.has(key)) continue;
      gl.deleteBuffer(buffer);
      batches.delete(key);
    }
    for (const [key, tile] of tiles) {
      const buffer = batches.get(key)?.buffer ?? gl.createBuffer();
      if (!buffer) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(tile.vertices),
        gl.STATIC_DRAW,
      );
      batches.set(key, { tile, buffer, length: tile.vertices.length });
    }
  }

  private uploadBuffer(
    gl: WebGL2RenderingContext,
    previous: SurfaceBuffer | null,
    vertices: number[] | Float32Array<ArrayBuffer>,
    stride: number,
  ) {
    if (!vertices.length) {
      gl.deleteBuffer(previous?.buffer ?? null);
      return null;
    }
    const buffer = previous?.buffer ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      vertices instanceof Float32Array ? vertices : new Float32Array(vertices),
      gl.STATIC_DRAW,
    );
    return { buffer, count: vertices.length / stride };
  }

  private uploadCitySection(
    gl: WebGL2RenderingContext,
    { vertices, indices }: EdinburghMeshSection,
  ): IndexedSurfaceBuffer | undefined {
    if (!indices.length) return;
    const buffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    if (!buffer || !indexBuffer) {
      gl.deleteBuffer(buffer);
      gl.deleteBuffer(indexBuffer);
      return;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    return {
      buffer,
      count: indices.length,
      indexBuffer,
      indexType:
        indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    };
  }

  private uploadCityMeshes(
    gl: WebGL2RenderingContext,
    meshes: EdinburghMesh[],
  ) {
    const started = performance.now();
    const wanted = new Set(meshes);
    for (const [mesh, buffers] of this.cityGpuMeshes) {
      if (wanted.has(mesh)) continue;
      this.deleteCityMesh(gl, buffers);
      this.cityGpuMeshes.delete(mesh);
    }
    const incoming = meshes.filter((mesh) => !this.cityGpuMeshes.has(mesh));
    if (!incoming.length) return;
    // Upload just the new tiles and leave the context's previous VAO intact.
    const previousArray = gl.getParameter(
      gl.VERTEX_ARRAY_BINDING,
    ) as WebGLVertexArrayObject | null;
    this.vao ??= gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    for (const mesh of incoming) {
      const buffers: CityMeshBuffers = {};
      for (const name of citySurfaceNames)
        buffers[name] = this.uploadCitySection(gl, mesh[name]);
      this.cityGpuMeshes.set(mesh, buffers);
    }
    gl.bindVertexArray(previousArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.map.getContainer().dataset.mapEdinburghMeshUploadMs = String(
      Math.round(performance.now() - started),
    );
  }

  private deleteCityMesh(gl: WebGL2RenderingContext, buffers: CityMeshBuffers) {
    for (const surface of Object.values(buffers)) {
      if (!surface) continue;
      gl.deleteBuffer(surface.buffer);
      gl.deleteBuffer(surface.indexBuffer);
    }
  }

  private *citySurfaces(name: CitySurface) {
    for (const [mesh, buffers] of this.cityGpuMeshes) {
      const surface = buffers[name];
      if (!surface) continue;
      const overview = this.overviewDraw.get(mesh);
      if (overview)
        yield { ...surface, overview, ranges: overview.ranges?.[name] };
      else yield surface;
    }
  }

  private drawSurface(
    gl: WebGL2RenderingContext,
    surface: SurfaceBuffer | IndexedSurfaceBuffer,
  ) {
    if ('indexBuffer' in surface) {
      const overview = surface.overview;
      if (overview && this.overviewFade > 0) {
        gl.uniform3f(this.overviewTileLocation, ...overview.tile);
        const opacity =
          overview.arrivedAt === undefined
            ? 1
            : Math.min(
                1,
                (this.frameTime - overview.arrivedAt) / overviewArrivalMs,
              );
        gl.uniform1f(this.overviewOpacityLocation, opacity);
        const [west, north, east, south] = overview.edges;
        const fade = this.overviewFade;
        gl.uniform4f(
          this.overviewEdgesLocation,
          west * fade,
          north * fade,
          east * fade,
          south * fade,
        );
      } else gl.uniform3f(this.overviewTileLocation, 0, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, surface.indexBuffer);
      if (surface.ranges) {
        const indexBytes = surface.indexType === gl.UNSIGNED_INT ? 4 : 2;
        for (const { first, count } of surface.ranges) {
          gl.drawElements(
            gl.TRIANGLES,
            count,
            surface.indexType,
            first * indexBytes,
          );
        }
      } else gl.drawElements(gl.TRIANGLES, surface.count, surface.indexType, 0);
    } else {
      gl.drawArrays(gl.TRIANGLES, 0, surface.count);
    }
  }

  private requestRoofTile(x: number, y: number, z: number) {
    const key = roofTileKey(x, y, z);
    if (this.textures.has(key)) return;
    const close = z > roofImageryZoom;
    const isCurrent = () => !close || this.visibleDetailTiles.has(key);
    void this.requestTexture(
      key,
      async (imagery) => {
        try {
          const { data } = await loadSatelliteTile(
            { url: `${satelliteProtocol}://${z}/${y}/${x}` },
            imagery,
          );
          return new Blob([data]);
        } catch (error) {
          if (close && isCurrent() && !imagery.signal.aborted) {
            this.requestRoofTile(x >> 1, y >> 1, z - 1);
          }
          throw error;
        }
      },
      isCurrent,
    );
  }

  private async requestTexture(
    key: string,
    load: (imagery: AbortController) => Promise<Blob>,
    isCurrent = () => true,
  ) {
    this.textures.set(key, null);
    const imagery = this.imagery;
    try {
      const data = await load(imagery);
      if (imagery.signal.aborted) return;
      // The detail atlas stores a neutral RGB value independently of its
      // mask. Premultiplication would shift that value near every edge.
      const image = await createImageBitmap(
        data,
        key === princesStreetRoofPhotos.detail.path
          ? { premultiplyAlpha: 'none' }
          : undefined,
      );
      if (imagery.signal.aborted || !isCurrent()) {
        image.close();
        if (!imagery.signal.aborted) this.textures.delete(key);
        return;
      }
      this.pendingImages.set(key, image);
      this.map.triggerRepaint();
    } catch {
      if (!imagery.signal.aborted && !isCurrent()) this.textures.delete(key);
      // The opaque roof stays visible while imagery is unavailable.
    }
  }

  private getTexture(gl: WebGL2RenderingContext, key: string) {
    const image = this.pendingImages.get(key);
    if (!image) return this.textures.get(key) ?? null;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.textures.set(key, texture);
    this.pendingImages.delete(key);
    image.close();
    return texture;
  }

  private drawTileRoofs(
    gl: WebGL2RenderingContext,
    args: CustomRenderMethodInput,
  ) {
    let drawnZoom = 0;
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    gl.disableVertexAttribArray(3);
    for (const [key, { tile, buffer, length }] of this.batches) {
      const { x, y, z } = tile;
      let texture = this.getTexture(gl, key);
      let textureZoom = z;
      if (!texture && z > roofImageryZoom) {
        texture = this.getTexture(gl, roofTileKey(x >> 1, y >> 1, z - 1));
        textureZoom = z - 1;
      }
      if (!texture) continue;
      const scale = 2 ** (textureZoom - z);
      const localScale = 2 ** (wallOriginTile.z - z);
      gl.uniform3f(
        this.roofTileToLocalLocation,
        x * localScale - wallOriginTile.x,
        y * localScale - wallOriginTile.y,
        localScale,
      );
      const overzoom = Math.max(0, this.map.getZoom() - textureZoom - 0.25);
      const clarity = Math.max(0.16, 1 - overzoom * 0.44);
      gl.uniform4f(
        this.detailUvLocation,
        scale === 1 ? 0 : (x % 2) * scale,
        scale === 1 ? 0 : (y % 2) * scale,
        scale,
        clarity,
      );
      const { mainMatrix } = args.getProjectionData({
        tileID: { canonical: { x, y, z } },
        applyTerrainMatrix: false,
      });
      gl.uniformMatrix4fv(this.matrixLocation, false, mainMatrix);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, length / 3);
      drawnZoom = Math.max(drawnZoom, textureZoom);
    }
    return drawnZoom;
  }

  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
    if (this.pendingCityMeshes) {
      this.uploadCityMeshes(gl, this.pendingCityMeshes);
      this.pendingCityMeshes = undefined;
    }
    if (this.pendingSurfaces) {
      this.uploadSurfaces(gl, this.pendingSurfaces);
      this.pendingSurfaces = null;
    }
    const zoom = this.map.getZoom();
    if (
      (!this.batches.size &&
        !this.walls &&
        !this.materialRoofs.size &&
        !this.cityGpuMeshes.size) ||
      zoom < (this.edinburghCity ? edinburghCityOverviewMinZoom : roofMinZoom)
    ) {
      delete this.map.getContainer().dataset.mapPrincesStreetFacades;
      delete this.map.getContainer().dataset.mapPrincesStreetRoofs;
      this.setRoofs(undefined);
      this.setFacades(undefined);
      return;
    }
    if (!this.initialized) {
      this.initialized = true;
      this.program = createProgram(gl);
      if (!this.program) return;
      this.matrixLocation = gl.getUniformLocation(this.program, 'u_matrix');
      this.wallLocation = gl.getUniformLocation(this.program, 'u_wall');
      this.photoLocation = gl.getUniformLocation(this.program, 'u_photo');
      this.frontageTileLocation = gl.getUniformLocation(
        this.program,
        'u_frontage_tile',
      );
      this.frontageAvailableLocation = gl.getUniformLocation(
        this.program,
        'u_frontage_available',
      );
      this.registeredRoofLocation = gl.getUniformLocation(
        this.program,
        'u_registered_roof',
      );
      this.registeredRoofAvailableLocation = gl.getUniformLocation(
        this.program,
        'u_registered_roof_available',
      );
      this.registeredRoofDetailLocation = gl.getUniformLocation(
        this.program,
        'u_registered_roof_detail',
      );
      this.registeredRoofRectLocation = gl.getUniformLocation(
        this.program,
        'u_registered_roof_rect',
      );
      this.roofTileToLocalLocation = gl.getUniformLocation(
        this.program,
        'u_roof_tile_to_local',
      );
      this.materialsLocation = gl.getUniformLocation(
        this.program,
        'u_materials',
      );
      this.shadedBuildingsLocation = gl.getUniformLocation(
        this.program,
        'u_shaded_buildings',
      );
      this.outlineLocation = gl.getUniformLocation(this.program, 'u_outline');
      this.outlineScaleLocation = gl.getUniformLocation(
        this.program,
        'u_outline_scale',
      );
      this.opacityLocation = gl.getUniformLocation(
        this.program,
        'u_model_opacity',
      );
      this.overviewOpacityLocation = gl.getUniformLocation(
        this.program,
        'u_overview_opacity',
      );
      this.overviewTileLocation = gl.getUniformLocation(
        this.program,
        'u_overview_tile',
      );
      this.overviewEdgesLocation = gl.getUniformLocation(
        this.program,
        'u_overview_edges',
      );
      this.detailPassLocation = gl.getUniformLocation(
        this.program,
        'u_detail_pass',
      );
      this.detailAmountLocation = gl.getUniformLocation(
        this.program,
        'u_detail_amount',
      );
      this.viewportLocation = gl.getUniformLocation(this.program, 'u_viewport');
      this.detailUvLocation = gl.getUniformLocation(
        this.program,
        'u_detail_uv',
      );
      this.roofViewLocation = gl.getUniformLocation(
        this.program,
        'u_view_direction',
      );
      this.roofCloseLocation = gl.getUniformLocation(
        this.program,
        'u_roof_close',
      );
      this.vao ??= gl.createVertexArray();
      this.fallbackTexture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fallbackTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([255, 255, 255, 255]),
      );
    }
    if (!this.program) return;

    gl.useProgram(this.program);
    gl.uniform1i(this.frontageTileLocation, 1);
    gl.uniform1i(this.registeredRoofLocation, 2);
    gl.uniform4f(this.registeredRoofRectLocation, ...registeredRoofRect);
    gl.activeTexture(gl.TEXTURE2);
    const registeredRoof =
      this.visibleRegisteredRoofPath &&
      this.map.getZoom() >= roofDetailStartZoom
        ? this.getTexture(gl, this.visibleRegisteredRoofPath)
        : null;
    gl.bindTexture(gl.TEXTURE_2D, registeredRoof ?? this.fallbackTexture);
    gl.uniform1i(
      this.registeredRoofAvailableLocation,
      Number(!!registeredRoof),
    );
    gl.uniform1i(
      this.registeredRoofDetailLocation,
      Number(this.registeredRoofMode === 'detail'),
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.disable(gl.CULL_FACE);
    const opacity = this.edinburghCity
      ? Math.min(
          1,
          (zoom - edinburghCityOverviewMinZoom) /
            (edinburghCityOverviewFullZoom - edinburghCityOverviewMinZoom),
        )
      : 1;
    this.overviewFade = Math.min(1, Math.max(0, roofMinZoom - zoom));
    this.frameTime = performance.now();
    if (
      this.overviewFade > 0 &&
      [...this.overviewDraw.values()].some(
        ({ arrivedAt }) =>
          arrivedAt !== undefined &&
          this.frameTime - arrivedAt < overviewArrivalMs,
      )
    )
      this.map.triggerRepaint();
    if (opacity < 1 || (this.edinburghCity && this.overviewFade > 0)) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else gl.disable(gl.BLEND);
    gl.uniform1f(this.opacityLocation, opacity);
    gl.depthMask(this.showingMaterials);
    gl.uniform1i(this.materialsLocation, Number(this.showingMaterials));
    gl.uniform1i(this.shadedBuildingsLocation, Number(this.shadedBuildings));
    gl.uniform1i(this.outlineLocation, 0);
    gl.uniform1i(this.wallLocation, 0);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    gl.disableVertexAttribArray(3);
    gl.uniform1f(
      this.roofCloseLocation,
      Math.min(1, Math.max(0, (zoom - 17.5) / 1.4)),
    );
    const range = roofDetailFullZoom - roofDetailStartZoom;
    const detailAmount =
      this.showingMaterials && this.batches.size
        ? Math.min(1, Math.max(0, (zoom - roofDetailStartZoom) / range))
        : 0;
    gl.uniform1i(this.detailPassLocation, 0);
    gl.uniform1f(this.detailAmountLocation, detailAmount);
    const drawn = !this.showingMaterials && this.drawTileRoofs(gl, args);
    const localMatrix = args.getProjectionData({
      tileID: { canonical: wallOriginTile },
      applyTerrainMatrix: false,
    }).mainMatrix;
    gl.uniformMatrix4fv(this.matrixLocation, false, localMatrix);
    const bearing = (this.map.getBearing() * Math.PI) / 180;
    const pitch = (this.map.getPitch() * Math.PI) / 180;
    gl.uniform3f(
      this.roofViewLocation,
      -Math.sin(bearing) * Math.sin(pitch),
      Math.cos(bearing) * Math.sin(pitch),
      Math.cos(pitch),
    );
    let sampled = false;
    const roofStride = materialRoofStride * Float32Array.BYTES_PER_ELEMENT;
    const roofSurfaces = this.edinburghCity
      ? this.citySurfaces('roofs')
      : Array.from(this.materialRoofs, ([key, { buffer, length }]) => ({
          buffer,
          count: length / materialRoofStride,
          key,
        }));
    for (const surface of roofSurfaces) {
      const texture =
        'key' in surface ? this.getTexture(gl, surface.key) : null;
      gl.uniform1i(this.photoLocation, Number(!!texture));
      gl.bindTexture(gl.TEXTURE_2D, texture ?? this.fallbackTexture);
      gl.bindBuffer(gl.ARRAY_BUFFER, surface.buffer);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, roofStride, 0);
      gl.vertexAttribPointer(
        1,
        4,
        gl.FLOAT,
        false,
        roofStride,
        3 * Float32Array.BYTES_PER_ELEMENT,
      );
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(
        3,
        4,
        gl.FLOAT,
        false,
        roofStride,
        7 * Float32Array.BYTES_PER_ELEMENT,
      );
      this.drawSurface(gl, surface);
      sampled ||= !!texture;
    }
    const { dataset } = this.map.getContainer();
    if (registeredRoof && this.registeredRoofMode)
      dataset.mapPrincesStreetRoofs = this.registeredRoofMode;
    else delete dataset.mapPrincesStreetRoofs;
    if (sampled) dataset.mapRoofColors = 'aerial';
    else delete dataset.mapRoofColors;
    gl.disableVertexAttribArray(3);
    let photographedFrontage = false;
    if (this.walls || this.cityGpuMeshes.size) {
      const photo = this.walls?.includesPhoto
        ? this.getTexture(gl, facadeTextureKey)
        : null;
      const stride = wallVertexStride * Float32Array.BYTES_PER_ELEMENT;
      gl.uniform1i(this.wallLocation, 1);
      gl.uniform1i(this.photoLocation, Number(!!photo));
      gl.bindTexture(gl.TEXTURE_2D, photo ?? this.fallbackTexture);
      gl.activeTexture(gl.TEXTURE1);
      const frontage =
        this.walls?.includesFrontage && zoom >= princesStreetFacadeZoom
          ? this.getTexture(gl, princesStreetFacadePath)
          : null;
      gl.bindTexture(gl.TEXTURE_2D, frontage ?? this.fallbackTexture);
      gl.uniform1i(this.frontageAvailableLocation, Number(!!frontage));
      gl.activeTexture(gl.TEXTURE0);
      photographedFrontage = !!frontage;
      gl.enableVertexAttribArray(1);
      gl.enableVertexAttribArray(2);
      gl.enableVertexAttribArray(3);
      const wallSurfaces = this.walls?.buffer
        ? [{ buffer: this.walls.buffer, count: this.walls.count }]
        : this.citySurfaces('walls');
      for (const surface of wallSurfaces) {
        gl.bindBuffer(gl.ARRAY_BUFFER, surface.buffer);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
        gl.vertexAttribPointer(
          1,
          4,
          gl.FLOAT,
          false,
          stride,
          3 * Float32Array.BYTES_PER_ELEMENT,
        );
        gl.vertexAttribPointer(
          2,
          1,
          gl.FLOAT,
          false,
          stride,
          7 * Float32Array.BYTES_PER_ELEMENT,
        );
        gl.vertexAttribPointer(
          3,
          4,
          gl.FLOAT,
          false,
          stride,
          8 * Float32Array.BYTES_PER_ELEMENT,
        );
        this.drawSurface(gl, surface);
      }
      gl.disableVertexAttribArray(3);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      this.setFacades(photo ? 'photo' : 'shaded');
    } else {
      this.setFacades(undefined);
    }
    if (photographedFrontage) dataset.mapPrincesStreetFacades = 'photo';
    else delete dataset.mapPrincesStreetFacades;
    if (detailAmount > 0) {
      gl.uniform1i(this.wallLocation, 0);
      gl.uniform1i(this.detailPassLocation, 1);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const textureZoom = this.drawTileRoofs(gl, args);
      if (textureZoom) {
        dataset.mapRoofDetail = 'aerial';
        dataset.mapRoofDetailZoom = String(textureZoom);
      } else {
        delete dataset.mapRoofDetail;
        delete dataset.mapRoofDetailZoom;
      }
      gl.disable(gl.BLEND);
      gl.uniform1i(this.detailPassLocation, 0);
      gl.uniformMatrix4fv(this.matrixLocation, false, localMatrix);
    } else {
      delete dataset.mapRoofDetail;
      delete dataset.mapRoofDetailZoom;
    }
    if (this.outlines || this.cityGpuMeshes.size) {
      const { clientWidth, clientHeight } = this.map.getCanvas();
      const stride = roofOutlineStride * Float32Array.BYTES_PER_ELEMENT;
      gl.uniform1i(this.outlineLocation, 1);
      gl.uniform1f(
        this.outlineScaleLocation,
        this.edinburghCity ? Math.min(1, 2 ** (zoom - roofMinZoom)) : 1,
      );
      gl.uniform2f(
        this.viewportLocation,
        Math.max(1, clientWidth),
        Math.max(1, clientHeight),
      );
      gl.enableVertexAttribArray(1);
      gl.enableVertexAttribArray(2);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const outlineSurfaces = this.outlines
        ? [this.outlines]
        : this.citySurfaces('outlines');
      for (const surface of outlineSurfaces) {
        gl.bindBuffer(gl.ARRAY_BUFFER, surface.buffer);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
        gl.vertexAttribPointer(
          1,
          4,
          gl.FLOAT,
          false,
          stride,
          3 * Float32Array.BYTES_PER_ELEMENT,
        );
        gl.vertexAttribPointer(
          2,
          1,
          gl.FLOAT,
          false,
          stride,
          7 * Float32Array.BYTES_PER_ELEMENT,
        );
        this.drawSurface(gl, surface);
      }
    }
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    this.setRoofs(
      this.materialRoofs.size || this.cityGpuMeshes.size
        ? 'materials'
        : drawn
          ? 'textured'
          : undefined,
    );
  }

  private setMaterialsActive(showing: boolean) {
    if (showing === this.showingMaterials) return;
    this.showingMaterials = showing;
    if (!this.edinburghCity && this.map.getLayer(aerialBuildingsLayerId))
      this.map.setPaintProperty(
        aerialBuildingsLayerId,
        'fill-extrusion-opacity',
        showing ? 0 : 1,
      );
    // The imagery contains its own shadows. Open up their dark tones and
    // quiet the backdrop so the roof edges, roads and overlays read clearly.
    if (this.map.getLayer(satelliteSourceId)) {
      this.map.setPaintProperty(
        satelliteSourceId,
        'raster-brightness-min',
        showing ? 0.105 : 0,
      );
      this.map.setPaintProperty(
        satelliteSourceId,
        'raster-brightness-max',
        showing ? 0.95 : 1,
      );
      this.map.setPaintProperty(
        satelliteSourceId,
        'raster-saturation',
        showing ? -0.18 : 0,
      );
    }
  }

  private setFacades(state: 'photo' | 'shaded' | undefined) {
    const { dataset } = this.map.getContainer();
    if (dataset.mapAerialFacades === state) return;
    if (state) dataset.mapAerialFacades = state;
    else delete dataset.mapAerialFacades;
  }

  private setRoofs(state: 'materials' | 'textured' | undefined) {
    const { dataset } = this.map.getContainer();
    if (dataset.mapAerialRoofs === state) return;
    if (state) dataset.mapAerialRoofs = state;
    else {
      delete dataset.mapAerialRoofs;
      delete dataset.mapRoofColors;
      delete dataset.mapRoofDetail;
      delete dataset.mapRoofDetailZoom;
    }
  }

  onRemove(map: LibreMap, gl: WebGL2RenderingContext) {
    this.removeBuildingSightlines?.();
    this.imagery.abort();
    this.surveyRequest.abort();
    this.setMaterialsActive(false);
    delete map.getContainer().dataset.mapLidarBuildings;
    delete map.getContainer().dataset.mapDetailedLidarBuildings;
    delete map.getContainer().dataset.mapLidarFacadeBands;
    delete map.getContainer().dataset.mapModeledFacadeOpenings;
    delete map.getContainer().dataset.mapModeledRoofMaterials;
    delete map.getContainer().dataset.mapEdinburghRoofTiles;
    delete map.getContainer().dataset.mapEdinburghBuildings;
    delete map.getContainer().dataset.mapEdinburghMeshMs;
    delete map.getContainer().dataset.mapEdinburghMeshTiles;
    delete map.getContainer().dataset.mapEdinburghCityOverviewTiles;
    delete map.getContainer().dataset.mapEdinburghCityOverviewTriangles;
    delete map.getContainer().dataset.mapEdinburghCityOverviewBytes;
    delete map.getContainer().dataset.mapEdinburghOverviewTiles;
    delete map.getContainer().dataset.mapEdinburghOverviewTriangles;
    delete map.getContainer().dataset.mapEdinburghOverviewBytes;
    delete map.getContainer().dataset.mapEdinburghMeshUploadMs;
    delete map.getContainer().dataset.mapShopfrontSegments;
    delete map.getContainer().dataset.mapPrincesStreetFacades;
    delete map.getContainer().dataset.mapPrincesStreetRoofs;
    map.off('moveend', this.invalidate);
    if (this.edinburghCity) {
      map.off('move', this.invalidate);
      map.off('render', this.refreshCityFrame);
    }
    map.off('resize', this.invalidate);
    map.off('sourcedata', this.onSourceData);
    map.off('idle', this.refresh);
    map.off('webglcontextrestored', this.restoreContext);
    this.setRoofs(undefined);
    this.setFacades(undefined);
    for (const { buffer } of this.batches.values()) gl.deleteBuffer(buffer);
    gl.deleteBuffer(this.walls?.buffer ?? null);
    for (const { buffer } of this.materialRoofs.values())
      gl.deleteBuffer(buffer);
    gl.deleteBuffer(this.outlines?.buffer ?? null);
    for (const buffers of this.cityGpuMeshes.values())
      this.deleteCityMesh(gl, buffers);
    for (const texture of this.textures.values()) gl.deleteTexture(texture);
    for (const image of this.pendingImages.values()) image.close();
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.fallbackTexture);
    gl.deleteProgram(this.program);
  }
}

export function addAerialRoofs(
  map: LibreMap,
  lidar: boolean,
  edinburghCity: boolean,
) {
  const layers = map.getStyle().layers;
  const buildingsIndex = layers.findIndex(
    ({ id }) => id === aerialBuildingsLayerId,
  );
  if (buildingsIndex === -1) return;
  const roofs = new AerialRoofs(
    lidar,
    edinburghCity || (lidar && isLocalShadedBuildingsPreview()),
    lidar && isLocalModeledFrontagePreview(),
    lidar && isLocalEdinburghPilotPreview(),
    edinburghCity,
    localPrincesStreetRoofPreview(),
  );
  map.addLayer(roofs, layers[buildingsIndex + 1]?.id);
  const layer = map.getLayer(roofLayerId);
  return () => {
    if (layer && map.getLayer(roofLayerId) === layer)
      map.removeLayer(roofLayerId);
  };
}
