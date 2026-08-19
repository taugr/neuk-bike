import type {
  OfflineAreaBounds,
  OfflineAreaDatasetSummary,
  OfflineAreaPlan,
  OfflineAreaResource,
} from '@/lib/offline-areas';

const mercatorLatitudeLimit = 85.05112878;
const vectorTileEstimateBytes = 200 * 1024;
const rasterTileEstimateBytes = 128 * 1024;
const spriteJsonEstimateBytes = 8 * 1024;
const spritePngEstimateBytes = 64 * 1024;
const glyphEstimateBytes = 24 * 1024;
const documentEstimateFloorBytes = 1024;
const defaultStyleUrls = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
} as const;

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type StyleSource = {
  tiles?: string[];
  type?: string;
  url?: string;
};

export type OfflineMapStyle = {
  glyphs?: string;
  layers?: Array<{ layout?: Record<string, unknown> }>;
  sources?: Record<string, StyleSource>;
  sprite?: string;
};

export type OfflineMapTileJson = {
  tiles: string[];
};

export type OfflineMapStyleMetadata = {
  style: OfflineMapStyle;
  url: string;
};

/** The fetched documents are injectable so planning is deterministic and browser-free. */
export type OfflineMapMetadata = {
  refreshedAt: string;
  styles: {
    dark: OfflineMapStyleMetadata;
    liberty: OfflineMapStyleMetadata;
  };
  tileJson: {
    data: OfflineMapTileJson;
    url: string;
  };
};

export type FetchOfflineMapMetadataOptions = {
  fetcher?: Fetcher;
  now?: () => Date;
  styleUrls?: Partial<Record<'dark' | 'liberty', string>>;
};

function documentByteLength(value: unknown) {
  return Math.max(
    documentEstimateFloorBytes,
    new TextEncoder().encode(JSON.stringify(value)).length,
  );
}

function resource(
  key: string,
  url: string,
  byteLength: number,
): OfflineAreaResource {
  return { byteLength, key, url };
}

/** Mirrors the service worker's deliberately narrow OpenFreeMap read allowlist. */
export function isAllowedOfflineMapUrl(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.hostname === 'tiles.openfreemap.org' &&
      url.search === '' &&
      url.hash === ''
    ) {
      return (
        /^\/styles\/(liberty|dark)(?:\/style\.json)?$/.test(url.pathname) ||
        /^\/sprites\/ofm_f384\/ofm(?:@2x)?(?:\.(?:json|png))?$/.test(
          url.pathname,
        ) ||
        /^\/fonts\/(?:%7Bfontstack%7D|[^/]+)\/(?:%7Brange%7D|\d+-\d+)\.pbf$/i.test(
          url.pathname,
        ) ||
        url.pathname === '/planet' ||
        /^\/planet\/\d[\d_]*_pt\/(?:%7Bz%7D|\d+)\/(?:%7Bx%7D|\d+)\/(?:%7By%7D|\d+)\.pbf$/i.test(
          url.pathname,
        ) ||
        /^\/natural_earth\/ne2sr\/(?:%7Bz%7D|\d+)\/(?:%7Bx%7D|\d+)\/(?:%7By%7D|\d+)\.png$/i.test(
          url.pathname,
        )
      );
    }
    return false;
  } catch {
    return false;
  }
}

function requireAllowedUrl(value: string, description: string) {
  if (!isAllowedOfflineMapUrl(value)) {
    throw new Error(`Unsafe OpenFreeMap ${description} URL.`);
  }
  return value;
}

function substituteTemplate(template: string, z: number, x: number, y: number) {
  if (
    !template.includes('{z}') ||
    !template.includes('{x}') ||
    !template.includes('{y}')
  ) {
    throw new Error(
      'OpenFreeMap tile templates must contain {z}, {x}, and {y}.',
    );
  }
  const url = template
    .replaceAll('{z}', String(z))
    .replaceAll('{x}', String(x))
    .replaceAll('{y}', String(y));
  return requireAllowedUrl(url, 'tile');
}

function longitudeToTile(longitude: number, zoom: number) {
  return ((longitude + 180) / 360) * 2 ** zoom;
}

function latitudeToTile(latitude: number, zoom: number) {
  const radians = (latitude * Math.PI) / 180;
  return ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * 2 ** zoom;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function longitudeRanges(bounds: OfflineAreaBounds) {
  const west = clamp(bounds.west, -180, 180);
  const east = clamp(bounds.east, -180, 180);
  return east < west
    ? [
        [west, 180],
        [-180, east],
      ]
    : [[west, east]];
}

/** Enumerates the closed XYZ tile coverage of bounds, including antimeridian-spanning areas. */
export function enumerateOfflineMapTiles(
  bounds: OfflineAreaBounds,
  zoom: number,
  padding = 0,
) {
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > 30) {
    throw new Error('Tile zoom must be an integer between 0 and 30.');
  }
  if (bounds.south > bounds.north)
    throw new Error('Bounds south must not exceed north.');
  if (!Number.isInteger(padding) || padding < 0 || padding > 2) {
    throw new Error('Tile padding must be an integer between 0 and 2.');
  }

  const size = 2 ** zoom;
  const north = clamp(
    bounds.north,
    -mercatorLatitudeLimit,
    mercatorLatitudeLimit,
  );
  const south = clamp(
    bounds.south,
    -mercatorLatitudeLimit,
    mercatorLatitudeLimit,
  );
  const yStart = clamp(
    Math.floor(latitudeToTile(north, zoom)) - padding,
    0,
    size - 1,
  );
  const yEnd = clamp(
    Math.ceil(latitudeToTile(south, zoom)) - 1 + padding,
    0,
    size - 1,
  );
  const tiles: Array<{ x: number; y: number; z: number }> = [];

  for (const [west, east] of longitudeRanges(bounds)) {
    const xStart = clamp(
      Math.floor(longitudeToTile(west, zoom)) - padding,
      0,
      size - 1,
    );
    const xEnd = clamp(
      Math.ceil(longitudeToTile(east, zoom)) - 1 + padding,
      0,
      size - 1,
    );
    for (let x = xStart; x <= xEnd; x += 1) {
      for (let y = yStart; y <= yEnd; y += 1) tiles.push({ x, y, z: zoom });
    }
  }
  return tiles;
}

function fontStacks(style: OfflineMapStyle) {
  const stacks = new Set<string>();
  for (const layer of style.layers ?? []) {
    const font = layer.layout?.['text-font'];
    if (Array.isArray(font) && font.every((item) => typeof item === 'string')) {
      stacks.add(font.join(','));
    }
  }
  return [...stacks].sort();
}

function relativeAssetUrl(
  template: string,
  replacements: Record<string, string>,
) {
  let url = template;
  for (const [token, value] of Object.entries(replacements)) {
    url = url.replaceAll(`{${token}}`, value);
  }
  return requireAllowedUrl(url, 'style asset');
}

function addTiles(
  resources: OfflineAreaResource[],
  keyPrefix: string,
  templates: readonly string[],
  bounds: OfflineAreaBounds,
  maximumZoom: number,
  byteLength: number,
  padding: number,
) {
  for (const template of templates)
    requireAllowedUrl(template, 'tile template');
  for (let z = 0; z <= maximumZoom; z += 1) {
    for (const { x, y } of enumerateOfflineMapTiles(bounds, z, padding)) {
      for (const template of templates) {
        const url = substituteTemplate(template, z, x, y);
        resources.push(
          resource(`${keyPrefix}:${z}/${x}/${y}`, url, byteLength),
        );
      }
    }
  }
}

function uniqueResources(resources: OfflineAreaResource[]) {
  const byUrl = new Map<string, OfflineAreaResource>();
  for (const item of resources) {
    const prior = byUrl.get(item.url);
    if (!prior || item.byteLength > prior.byteLength) byUrl.set(item.url, item);
  }
  return [...byUrl.values()].sort((left, right) =>
    left.url.localeCompare(right.url),
  );
}

/**
 * Plans a bounded, deterministic OpenFreeMap cache. Network metadata is supplied
 * by the caller so this function has no browser or fetch dependency.
 */
export function planOfflineMapTiles(
  bounds: OfflineAreaBounds,
  metadata: OfflineMapMetadata,
): OfflineAreaPlan {
  requireAllowedUrl(metadata.tileJson.url, 'TileJSON');
  const resources: OfflineAreaResource[] = [
    resource(
      'basemap:tilejson',
      metadata.tileJson.url,
      documentByteLength(metadata.tileJson.data),
    ),
  ];

  for (const [theme, entry] of Object.entries(metadata.styles) as Array<
    ['dark' | 'liberty', OfflineMapStyleMetadata]
  >) {
    requireAllowedUrl(entry.url, 'style');
    resources.push(
      resource(
        `basemap:style:${theme}`,
        entry.url,
        documentByteLength(entry.style),
      ),
    );

    if (entry.style.sprite) {
      const sprite = requireAllowedUrl(entry.style.sprite, 'sprite');
      for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) {
        resources.push(
          resource(
            `basemap:sprite:${theme}:${suffix}`,
            `${sprite}${suffix}`,
            suffix.endsWith('.png')
              ? spritePngEstimateBytes
              : spriteJsonEstimateBytes,
          ),
        );
      }
    }

    if (entry.style.glyphs) {
      for (const fontstack of fontStacks(entry.style)) {
        for (const range of ['0-255', '256-511', '1280-1535', '8192-8447']) {
          resources.push(
            resource(
              `basemap:glyph:${theme}:${fontstack}:${range}`,
              relativeAssetUrl(entry.style.glyphs, {
                fontstack: encodeURIComponent(fontstack),
                range,
              }),
              glyphEstimateBytes,
            ),
          );
        }
      }
    }

    for (const [sourceId, source] of Object.entries(
      entry.style.sources ?? {},
    )) {
      if (source.type !== 'raster' || !source.tiles) continue;
      addTiles(
        resources,
        `basemap:raster:${theme}:${sourceId}`,
        source.tiles,
        bounds,
        6,
        rasterTileEstimateBytes,
        1,
      );
    }
  }

  addTiles(
    resources,
    'basemap:vector',
    metadata.tileJson.data.tiles,
    bounds,
    14,
    vectorTileEstimateBytes,
    1,
  );
  const unique = uniqueResources(resources);
  const datasets: OfflineAreaDatasetSummary[] = [
    { id: 'basemap', refreshedAt: metadata.refreshedAt },
  ];
  return {
    datasets,
    estimatedBytes: unique.reduce((total, item) => total + item.byteLength, 0),
    manifestRefreshedAt: metadata.refreshedAt,
    resources: unique,
  };
}

function findVectorTileJsonUrl(style: OfflineMapStyle) {
  const source = Object.values(style.sources ?? {}).find(
    (candidate) => candidate.type === 'vector' && candidate.url,
  );
  if (!source?.url)
    throw new Error('OpenFreeMap style has no vector TileJSON source.');
  return requireAllowedUrl(source.url, 'TileJSON');
}

function getTileReleaseDate(tileTemplates: string[]) {
  for (const template of tileTemplates) {
    const match = new URL(template).pathname.match(
      /\/planet\/(\d{4})(\d{2})(\d{2})_[^/]+\//,
    );
    if (!match) continue;
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
    if (Number.isFinite(date.getTime())) return date;
  }
  return null;
}

async function fetchJson<T>(fetcher: Fetcher, url: string) {
  const response = await fetcher(url);
  if (!response.ok)
    throw new Error(
      `Could not fetch OpenFreeMap metadata (${response.status}).`,
    );
  return {
    data: (await response.json()) as T,
    lastModified: response.headers.get('last-modified'),
  };
}

/** Fetches the two styles and their authoritative vector TileJSON once for a later pure plan. */
export async function fetchOfflineMapMetadata(
  options: FetchOfflineMapMetadataOptions = {},
): Promise<OfflineMapMetadata> {
  const fetcher = options.fetcher ?? fetch;
  const styleUrls = { ...defaultStyleUrls, ...options.styleUrls };
  const libertyUrl = requireAllowedUrl(styleUrls.liberty, 'style');
  const darkUrl = requireAllowedUrl(styleUrls.dark, 'style');
  const [libertyResponse, darkResponse] = await Promise.all([
    fetchJson<OfflineMapStyle>(fetcher, libertyUrl),
    fetchJson<OfflineMapStyle>(fetcher, darkUrl),
  ]);
  const liberty = libertyResponse.data;
  const dark = darkResponse.data;
  const tileJsonUrl = findVectorTileJsonUrl(liberty);
  const tileJsonResponse = await fetchJson<OfflineMapTileJson>(
    fetcher,
    tileJsonUrl,
  );
  const tileJson = tileJsonResponse.data;
  if (!Array.isArray(tileJson.tiles) || tileJson.tiles.length === 0) {
    throw new Error('OpenFreeMap TileJSON has no tile templates.');
  }
  const tileJsonLastModified = tileJsonResponse.lastModified
    ? new Date(tileJsonResponse.lastModified)
    : null;
  const tileReleaseDate = getTileReleaseDate(tileJson.tiles);
  const refreshedAt = tileReleaseDate
    ? tileReleaseDate.toISOString()
    : tileJsonLastModified && Number.isFinite(tileJsonLastModified.getTime())
      ? tileJsonLastModified.toISOString()
      : (options.now ?? (() => new Date()))().toISOString();
  return {
    refreshedAt,
    styles: {
      dark: { style: dark, url: darkUrl },
      liberty: { style: liberty, url: libertyUrl },
    },
    tileJson: { data: tileJson, url: tileJsonUrl },
  };
}
