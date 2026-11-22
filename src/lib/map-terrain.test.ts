import { describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  stabilizeTerrainPan,
  syncMapTerrain,
  terrainSourceId,
  terrainTransitionDuration,
  transitionMapTerrain,
} from './map-terrain';
import { lidarTerrainSourceId } from './waverley-lidar';

function mapFixture() {
  const sources = new Map<string, unknown>();
  let terrain: { source: string } | null = null;
  const calls: string[] = [];
  const listeners = new Map<string, Set<() => void>>();
  let pitch = 0;
  let clamped = true;
  const map = {
    getCenter: () => ({ lng: -3.199, lat: 55.949 }),
    getCenterElevation: () => 110,
    getCenterClampedToGround: () => clamped,
    isMoving: vi.fn(() => false),
    setCenterClampedToGround: vi.fn((value: boolean) => {
      clamped = value;
    }),
    queryTerrainElevation: vi.fn(() => 82),
    getPitch: () => pitch,
    setMaxPitch: vi.fn(),
    isSourceLoaded: vi.fn(() => false),
    easeTo: vi.fn(),
    triggerRepaint: vi.fn(),
    on: (event: string, listener: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    off: (event: string, listener: () => void) => {
      listeners.get(event)?.delete(listener);
    },
    getSource: (id = terrainSourceId) => sources.get(id),
    addSource: vi.fn((id: string, value: unknown) => {
      sources.set(id, value);
    }),
    getTerrain: () => terrain,
    setTerrain: vi.fn((value: { source: string } | null) => {
      terrain = value;
      calls.push('terrain');
    }),
    removeSource: vi.fn((id: string) => {
      sources.delete(id);
      calls.push('remove');
    }),
  };
  return {
    map,
    calls,
    api: map as unknown as MapLibreMap,
    setPitch: (value: number) => {
      pitch = value;
    },
    emit: (event: string) => {
      for (const listener of [...(listeners.get(event) ?? [])]) listener();
    },
  };
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

  it('swaps to the preview DEM and removes each previous source after switching', () => {
    const { map, api, calls } = mapFixture();
    syncMapTerrain(api, true);
    syncMapTerrain(api, true, true);
    expect(map.getTerrain()?.source).toBe(lidarTerrainSourceId);
    expect(map.getSource(lidarTerrainSourceId)).toMatchObject({ maxzoom: 17 });
    expect(map.getSource(terrainSourceId)).toBeUndefined();
    expect(calls).toEqual(['terrain', 'terrain', 'remove']);
    syncMapTerrain(api, true);
    expect(map.getTerrain()?.source).toBe(terrainSourceId);
    expect(map.getSource(lidarTerrainSourceId)).toBeUndefined();
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

describe('terrain pan', () => {
  it('holds elevation until drag and inertia end, then eases without changing zoom', async () => {
    const { map, api, emit } = mapFixture();
    const remove = stabilizeTerrainPan(api, false);
    emit('dragstart');
    emit('dragend');
    expect(map.getCenterClampedToGround()).toBe(false);
    expect(map.easeTo).not.toHaveBeenCalled();
    emit('moveend');
    await Promise.resolve();
    expect(map.getCenterClampedToGround()).toBe(true);
    expect(map.easeTo).toHaveBeenCalledExactlyOnceWith({ duration: 480 });
    emit('moveend');
    await Promise.resolve();
    expect(map.easeTo).toHaveBeenCalledTimes(1);
    remove();
  });

  it('restores the ground clamp and cancels a queued ease when removed', async () => {
    const { map, api, emit } = mapFixture();
    const remove = stabilizeTerrainPan(api, false);
    emit('dragstart');
    emit('moveend');
    remove();
    await Promise.resolve();
    expect(map.getCenterClampedToGround()).toBe(true);
    expect(map.easeTo).not.toHaveBeenCalled();
    emit('dragstart');
    expect(map.getCenterClampedToGround()).toBe(true);
  });
});

describe('terrain camera transition', () => {
  it('waits for rendered elevation before starting one smooth tilt', () => {
    const { map, api, emit } = mapFixture();
    transitionMapTerrain(api, true, false);
    expect(map.setMaxPitch).toHaveBeenLastCalledWith(60);
    emit('render');
    expect(map.easeTo).not.toHaveBeenCalled();
    map.isSourceLoaded.mockReturnValue(true);
    emit('render');
    emit('render');
    expect(map.easeTo).toHaveBeenCalledExactlyOnceWith({
      pitch: 55,
      duration: terrainTransitionDuration,
    });
  });

  it('keeps terrain attached until the camera is flat, even after an interruption', () => {
    const { map, api, emit, setPitch } = mapFixture();
    syncMapTerrain(api, true);
    setPitch(55);
    transitionMapTerrain(api, false, false);
    expect(map.getTerrain()).not.toBeNull();
    expect(map.setMaxPitch).not.toHaveBeenCalled();
    setPitch(24);
    emit('moveend');
    expect(map.getTerrain()).not.toBeNull();
    setPitch(0);
    emit('moveend');
    expect(map.getTerrain()).toBeNull();
    expect(map.getSource()).toBeUndefined();
    expect(map.setMaxPitch).toHaveBeenLastCalledWith(0);
  });

  it('cancels a pending tilt when switched off before tiles arrive', () => {
    const { map, api, emit } = mapFixture();
    const cancel = transitionMapTerrain(api, true, false);
    cancel();
    transitionMapTerrain(api, false, false);
    map.isSourceLoaded.mockReturnValue(true);
    emit('render');
    expect(map.easeTo).not.toHaveBeenCalled();
    expect(map.getTerrain()).toBeNull();
  });

  it('does not detach terrain from a cancelled return to 2D', () => {
    const { map, api, emit, setPitch } = mapFixture();
    syncMapTerrain(api, true);
    setPitch(55);
    const cancel = transitionMapTerrain(api, false, false);
    cancel();
    transitionMapTerrain(api, true, false);
    setPitch(0);
    emit('moveend');
    expect(map.getTerrain()).not.toBeNull();
  });

  it('respects reduced motion once elevation is ready', () => {
    const { map, api, emit } = mapFixture();
    map.isSourceLoaded.mockReturnValue(true);
    transitionMapTerrain(api, true, true);
    emit('render');
    expect(map.easeTo).toHaveBeenCalledWith({ pitch: 55, duration: 0 });
  });
});
