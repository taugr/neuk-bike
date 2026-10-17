import { describe, expect, it } from 'vitest';
import {
  initialWindLayer,
  reduceWindLayer,
  windLayerVisible,
} from './wind-layer';

describe('temporary wind layer ownership', () => {
  for (const originallyVisible of [false, true]) {
    it(`restores the original ${originallyVisible ? 'on' : 'off'} choice over repeated cycles`, () => {
      let state = reduceWindLayer(initialWindLayer, {
        type: 'manual',
        visible: originallyVisible,
      });
      for (let cycle = 0; cycle < 3; cycle++) {
        const owner = {};
        state = reduceWindLayer(state, { type: 'prefer', owner });
        expect(windLayerVisible(state, owner)).toBe(true);
        expect(state.manualVisible).toBe(originallyVisible);
        expect(windLayerVisible(state, null)).toBe(originallyVisible);
        state = reduceWindLayer(state, { type: 'end' });
        expect(windLayerVisible(state, owner)).toBe(originallyVisible);
      }
    });
    it(`keeps a manual hide from an originally ${originallyVisible ? 'on' : 'off'} layer`, () => {
      const owner = {};
      let state = reduceWindLayer(
        { manualVisible: originallyVisible, autoShowFor: null },
        { type: 'prefer', owner },
      );
      state = reduceWindLayer(state, { type: 'manual', visible: false });
      expect(windLayerVisible(state, owner)).toBe(false);
      expect(windLayerVisible(state, null)).toBe(false);
    });
  }
  it('retains manual off/on, and starts the next interval with that latest choice', () => {
    const owner = {};
    let state = reduceWindLayer(initialWindLayer, { type: 'prefer', owner });
    state = reduceWindLayer(state, { type: 'manual', visible: false });
    state = reduceWindLayer(state, { type: 'manual', visible: true });
    state = reduceWindLayer(state, { type: 'end' });
    expect(windLayerVisible(state, null)).toBe(true);
    const next = {};
    state = reduceWindLayer(state, { type: 'prefer', owner: next });
    expect(windLayerVisible(state, next)).toBe(true);
    state = reduceWindLayer(state, { type: 'end' });
    expect(windLayerVisible(state, null)).toBe(true);
  });
  it('never leaks auto-show into a different preference or inactive route view', () => {
    const owner = {},
      next = {};
    let state = reduceWindLayer(initialWindLayer, { type: 'prefer', owner });
    expect(windLayerVisible(state, null)).toBe(false);
    expect(windLayerVisible(state, next)).toBe(false);
    state = reduceWindLayer(state, { type: 'end' });
    expect(windLayerVisible(state, owner)).toBe(false);
    state = reduceWindLayer(state, { type: 'prefer', owner: next });
    expect(windLayerVisible(state, next)).toBe(true);
  });
});
