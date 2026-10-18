import { describe, expect, it, vi } from 'vitest';
import type { Map } from 'maplibre-gl';
import { syncMapTerrain, terrainSourceId } from './map-terrain';

function mapFixture() {
  let source: unknown;
  let terrain: { source: string } | null = null;
  const calls: string[] = [];
  const map = {
    getSource: () => source,
    addSource: vi.fn((_id: string, value: unknown) => {
      source = value;
    }),
    getTerrain: () => terrain,
    setTerrain: vi.fn((value: { source: string } | null) => {
      terrain = value;
      calls.push('terrain');
    }),
    removeSource: vi.fn(() => {
      source = undefined;
      calls.push('remove');
    }),
  };
  return { map, calls, api: map as unknown as Map };
}

describe('optional map terrain', () => {
  it('does not fetch elevation in the default flat view', () => {
    const { map, api } = mapFixture();
    syncMapTerrain(api, false);
    expect(map.addSource).not.toHaveBeenCalled();
    expect(map.setTerrain).not.toHaveBeenCalled();
  });

  it('uses Terrarium encoding with realistic elevation and reuses the source', () => {
    const { map, api } = mapFixture();
    syncMapTerrain(api, true);
    syncMapTerrain(api, true);
    expect(map.addSource).toHaveBeenCalledExactlyOnceWith(
      terrainSourceId,
      expect.objectContaining({
        type: 'raster-dem',
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 14,
      }),
    );
    expect(map.setTerrain).toHaveBeenCalledExactlyOnceWith({
      source: terrainSourceId,
      exaggeration: 1,
    });
  });

  it('detaches terrain before removing its source and can enable it again', () => {
    const { map, api, calls } = mapFixture();
    syncMapTerrain(api, true);
    syncMapTerrain(api, false);
    expect(calls).toEqual(['terrain', 'terrain', 'remove']);
    expect(map.getTerrain()).toBeNull();
    expect(map.getSource()).toBeUndefined();
    syncMapTerrain(api, true);
    expect(map.addSource).toHaveBeenCalledTimes(2);
    expect(map.getTerrain()?.source).toBe(terrainSourceId);
  });
});
