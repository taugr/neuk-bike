import { describe, expect, it } from 'vitest';
import {
  initialParkingPanelState,
  reduceParkingPanel,
} from '@/lib/parking-panel';

describe('parking panel navigation', () => {
  it('keeps list selection in the list view', () => {
    const state = reduceParkingPanel(initialParkingPanelState, {
      selectedId: 'parking-1',
      type: 'SELECT_LIST_POINT',
    });

    expect(state).toMatchObject({
      returnView: 'list',
      selectedId: 'parking-1',
      transition: 'replace',
      view: 'list',
    });
  });

  it('distinguishes list navigation from direct map replacement', () => {
    const fromList = reduceParkingPanel(initialParkingPanelState, {
      origin: 'list',
      selectedId: 'parking-1',
      type: 'OPEN_DETAILS',
    });
    const fromMap = reduceParkingPanel(initialParkingPanelState, {
      origin: 'map',
      selectedId: 'parking-1',
      type: 'OPEN_DETAILS',
    });

    expect(fromList).toMatchObject({
      direction: 1,
      transition: 'navigate',
      view: 'details',
    });
    expect(fromMap).toMatchObject({
      direction: 0,
      transition: 'replace',
      view: 'details',
    });
  });

  it('returns directions to the view that launched them', () => {
    const details = reduceParkingPanel(initialParkingPanelState, {
      origin: 'list',
      selectedId: 'parking-1',
      type: 'OPEN_DETAILS',
    });
    const directions = reduceParkingPanel(details, {
      selectedId: 'parking-1',
      type: 'OPEN_DIRECTIONS',
    });
    const returned = reduceParkingPanel(directions, {
      type: 'EXIT_DIRECTIONS',
    });

    expect(directions.returnView).toBe('details');
    expect(returned).toMatchObject({
      direction: -1,
      selectedId: 'parking-1',
      view: 'details',
    });
  });

  it('keeps nearby and saved list changes in the list view', () => {
    const saved = reduceParkingPanel(initialParkingPanelState, {
      selectedId: 'saved-1',
      type: 'SHOW_SAVED',
    });
    const nearby = reduceParkingPanel(saved, {
      selectedId: 'nearby-1',
      type: 'SHOW_NEARBY',
    });

    expect(saved).toMatchObject({
      listContext: 'saved',
      selectedId: 'saved-1',
      view: 'list',
    });
    expect(nearby).toMatchObject({
      direction: -1,
      listContext: 'nearby',
      selectedId: 'nearby-1',
      view: 'list',
    });
  });

  it('cannot retain details without a selection', () => {
    const details = reduceParkingPanel(initialParkingPanelState, {
      origin: 'map',
      selectedId: 'parking-1',
      type: 'OPEN_DETAILS',
    });
    const cleared = reduceParkingPanel(details, {
      type: 'CLEAR_SELECTION',
    });

    expect(cleared).toMatchObject({ selectedId: null, view: 'list' });
  });
});
