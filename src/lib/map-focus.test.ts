import { describe, expect, it } from 'vitest';
import {
  hasMapFocusTargetChanged,
  shouldApplyMapFocus,
  type MapFocusTarget,
} from '@/lib/map-focus';

const target: MapFocusTarget = {
  currentLocationFocusRequestId: 1,
  route: null,
  selectedPointId: null,
  userLatitude: 55.8642,
  userLongitude: -4.2518,
};

describe('map focus', () => {
  it('does not refocus when only background map data changes', () => {
    expect(
      shouldApplyMapFocus({
        hasAppliedNearbyFocus: true,
        hasNearbyFocusPoints: true,
        next: target,
        previous: target,
      }),
    ).toBe(false);
  });

  it('applies the first nearby focus after location data arrives', () => {
    expect(
      shouldApplyMapFocus({
        hasAppliedNearbyFocus: false,
        hasNearbyFocusPoints: true,
        next: target,
        previous: target,
      }),
    ).toBe(true);
  });

  it('recognises an explicit current-location focus request', () => {
    expect(
      hasMapFocusTargetChanged(target, {
        ...target,
        currentLocationFocusRequestId: 2,
      }),
    ).toBe(true);
  });

  it('recognises location, selection, and route focus changes', () => {
    expect(
      hasMapFocusTargetChanged(target, {
        ...target,
        userLongitude: -2.9707,
      }),
    ).toBe(true);
    expect(
      hasMapFocusTargetChanged(target, {
        ...target,
        selectedPointId: 'osm:node:1',
      }),
    ).toBe(true);
    expect(hasMapFocusTargetChanged(target, { ...target, route: {} })).toBe(
      true,
    );
  });
});
