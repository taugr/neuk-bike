import { describe, expect, it, vi } from 'vitest';
import type { Map as LibreMap, LayerSpecification } from 'maplibre-gl';
import {
  addAerialBuildings,
  addSatelliteBasemap,
  aerialBuildingsLayerId,
  castleRockLayerId,
  loadSatelliteTile,
  satelliteSourceId,
} from './map-satellite';
import {
  edinburghOverviewMinZoom,
  isLocalAerialPreview,
} from './local-aerial-preview';

function fixture() {
  const container = { dataset: {} };
  const vectorSources = { openmaptiles: { type: 'vector' } };
  const specs: LayerSpecification[] = [
    { id: 'background', type: 'background' },
    { id: 'land', type: 'fill', source: 'base' },
    { id: 'buildings', type: 'fill-extrusion', source: 'base' },
    {
      id: 'labels',
      type: 'symbol',
      source: 'base',
      layout: { 'text-field': '{name}' },
      paint: { 'text-color': '#123456' },
    },
    { id: 'route', type: 'line', source: 'journey' },
  ];
  const layers = new Map(specs.map((layer) => [layer.id, layer]));
  const sources = new Map();
  const map = {
    getStyle: () => ({ layers: specs, sources: vectorSources }),
    getContainer: () => container,
    getLayer: (id: string) => layers.get(id),
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id, source) => sources.set(id, source)),
    addLayer: vi.fn((layer) => layers.set(layer.id, layer)),
    removeLayer: vi.fn((id) => layers.delete(id)),
    removeSource: vi.fn((id) => sources.delete(id)),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
  };
  return { map, api: map as unknown as LibreMap, layers };
}

describe('satellite basemap', () => {
  const baseIds = ['background', 'land', 'buildings', 'labels'];
  it('prepares imagery under labels without hiding the street map before tiles arrive', () => {
    const { map, api } = fixture();
    addSatelliteBasemap(api, baseIds);
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: satelliteSourceId }),
      'labels',
    );
    expect(map.setLayoutProperty).not.toHaveBeenCalled();
    expect(map.addSource).toHaveBeenCalledWith(
      satelliteSourceId,
      expect.objectContaining({
        tiles: ['neuk-satellite://{z}/{y}/{x}'],
        maxzoom: 19,
        tileSize: 256,
      }),
    );
  });
  it('hides base geometry, keeps overlays and labels, and restores the original style', () => {
    const { map, api } = fixture();
    const imagery = addSatelliteBasemap(api, baseIds);
    imagery.show();
    imagery.show();
    expect(map.setLayoutProperty.mock.calls).toEqual([
      ['land', 'visibility', 'none'],
      ['buildings', 'visibility', 'none'],
    ]);
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'labels',
      'text-color',
      '#ffffff',
    );
    imagery.remove();
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      'land',
      'visibility',
      'visible',
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'labels',
      'text-color',
      '#123456',
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'labels',
      'text-halo-width',
      undefined,
    );
    expect(map.getSource(satelliteSourceId)).toBeUndefined();
    expect(map.getLayer('route')).toBeDefined();
  });
  it('does not overwrite a replacement theme on cleanup', () => {
    const { map, api } = fixture();
    const imagery = addSatelliteBasemap(api, baseIds);
    imagery.show();
    map.setPaintProperty.mockClear();
    map.setLayoutProperty.mockClear();
    imagery.remove(false);
    expect(map.setPaintProperty).not.toHaveBeenCalled();
    expect(map.setLayoutProperty).not.toHaveBeenCalled();
  });
  it('keeps existing cycling lines above imagery when they precede labels', () => {
    const { map, api } = fixture();
    map.getStyle().layers.splice(3, 0, {
      id: 'cycle-network',
      type: 'line',
      source: 'cycling',
    });
    addSatelliteBasemap(api, baseIds).show();
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: satelliteSourceId }),
      'cycle-network',
    );
    expect(map.setLayoutProperty).not.toHaveBeenCalledWith(
      'cycle-network',
      'visibility',
      'none',
    );
  });
});

describe('local aerial preview', () => {
  it('requires a loopback host and explicit opt-in', () => {
    expect(
      isLocalAerialPreview(new URL('http://127.0.0.1/?aerialPreview=1')),
    ).toBe(true);
    expect(isLocalAerialPreview(new URL('http://127.0.0.1/'))).toBe(false);
    expect(
      isLocalAerialPreview(new URL('https://neuk.bike/?aerialPreview=1')),
    ).toBe(false);
  });

  it.each([
    [
      'http://127.0.0.1/?aerialPreview=1&facades=princes&roofs=detail',
      'Nick Hawkes',
    ],
    [
      'http://127.0.0.1/?aerialPreview=1&facades=princes&roofs=photo',
      '瑞丽江的河水',
    ],
    ['https://neuk.bike/?aerialPreview=1&facades=princes&roofs=detail', null],
    [
      'http://127.0.0.1/?aerialPreview=1&facades=princes&roofs=detail&lidar=0',
      null,
    ],
  ])('credits only the opted-in roof image for %s', (url, credit) => {
    vi.stubGlobal('window', { location: new URL(url) });
    try {
      const { map, api } = fixture();
      addSatelliteBasemap(api, []);
      const [, source] = map.addSource.mock.calls[0];
      expect(source.attribution.includes('Nick Hawkes')).toBe(
        credit === 'Nick Hawkes',
      );
      expect(source.attribution.includes('瑞丽江的河水')).toBe(
        credit === '瑞丽江的河水',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('retains ground imagery attribution and omits building photo credits in the shaded preview', () => {
    vi.stubGlobal('window', {
      location: new URL(
        'http://127.0.0.1/?aerialPreview=1&buildings=shaded&facades=princes&roofs=detail',
      ),
    });
    try {
      const { map, api } = fixture();
      addSatelliteBasemap(api, []);
      const [, source] = map.addSource.mock.calls[0];
      expect(source.attribution).toContain('Esri');
      expect(source.attribution).toContain('Princes Street laser returns');
      expect(source.attribution).not.toMatch(
        /Waverley Gate photo|Princes Street textures|Nick Hawkes/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses the existing building tiles between imagery and labels', () => {
    const { map, api } = fixture();
    expect(addAerialBuildings(api)).toBeUndefined();
    map.getStyle().layers.splice(3, 0, {
      id: satelliteSourceId,
      type: 'raster',
      source: satelliteSourceId,
    });
    const remove = addAerialBuildings(api);
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: aerialBuildingsLayerId,
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        paint: expect.objectContaining({
          'fill-extrusion-height': ['number', ['get', 'render_height'], 0],
          'fill-extrusion-base': ['number', ['get', 'render_min_height'], 0],
        }),
      }),
      'labels',
    );
    expect(map.addSource).not.toHaveBeenCalled();
    remove?.();
    expect(map.getLayer(aerialBuildingsLayerId)).toBeUndefined();
  });

  it.each([
    ['http://127.0.0.1/?aerialPreview=1&buildings=edinburgh', true],
    ['http://127.0.0.1/?aerialPreview=1&buildings=shaded', false],
    ['https://neuk.bike/?aerialPreview=1&buildings=edinburgh', false],
  ])(
    'drapes the cliff material only in the local Edinburgh preview for %s',
    (url, enabled) => {
      vi.stubGlobal('window', { location: new URL(url) });
      try {
        const { map, api } = fixture();
        map.getStyle().layers.splice(3, 0, {
          id: satelliteSourceId,
          type: 'raster',
          source: satelliteSourceId,
        });
        const remove = addAerialBuildings(api);
        if (enabled) {
          expect(map.getLayer(aerialBuildingsLayerId)).toMatchObject({
            layout: { visibility: 'none' },
          });
          expect(map.addLayer).toHaveBeenCalledWith(
            expect.objectContaining({
              id: castleRockLayerId,
              type: 'raster',
              minzoom: edinburghOverviewMinZoom,
            }),
            aerialBuildingsLayerId,
          );
          expect(map.getSource(castleRockLayerId)).toEqual(
            expect.objectContaining({
              type: 'image',
              url: '/data/edinburgh-buildings/castle-rock.webp',
            }),
          );
        } else {
          expect(map.getLayer(aerialBuildingsLayerId)).not.toHaveProperty(
            'layout',
          );
          expect(map.getLayer(castleRockLayerId)).toBeUndefined();
          expect(map.addSource).not.toHaveBeenCalled();
        }
        remove?.();
        expect(map.getLayer(castleRockLayerId)).toBeUndefined();
        expect(map.getSource(castleRockLayerId)).toBeUndefined();
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
});

describe('Esri tile loader', () => {
  it('uses Esri row/column order and passes cancellation and cache metadata', async () => {
    const controller = new AbortController();
    const fetchTile = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([1, 2]), {
        headers: { 'cache-control': 'max-age=60' },
      }),
    );
    const result = await loadSatelliteTile(
      { url: 'neuk-satellite://12/1320/2012' },
      controller,
      fetchTile,
    );
    expect(fetchTile).toHaveBeenCalledWith(
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1320/2012?blankTile=false',
      { signal: controller.signal },
    );
    expect(result.cacheControl).toBe('max-age=60');
    expect(new Uint8Array(result.data)).toEqual(new Uint8Array([1, 2]));
  });
  it('allows parent fallback for missing high-detail tiles', async () => {
    const fetchTile = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      loadSatelliteTile(
        { url: 'neuk-satellite://19/1/2' },
        new AbortController(),
        fetchTile,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('preserves HTTP errors', async () => {
    const fetchTile = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
      loadSatelliteTile(
        { url: 'neuk-satellite://12/1/2' },
        new AbortController(),
        fetchTile,
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
  it('does not disguise overview connection failures or cancellations as missing imagery', async () => {
    const error = new TypeError('Failed to fetch');
    const fetchTile = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(
      loadSatelliteTile(
        { url: 'neuk-satellite://12/1/2' },
        new AbortController(),
        fetchTile,
      ),
    ).rejects.toBe(error);
    const controller = new AbortController();
    controller.abort();
    await expect(
      loadSatelliteTile(
        { url: 'neuk-satellite://19/1/2' },
        controller,
        fetchTile,
      ),
    ).rejects.toBe(error);
  });
});
