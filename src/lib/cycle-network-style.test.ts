import { describe, expect, it } from 'vitest';
import { getCycleNetworkLineStyles } from './cycle-network-style';

function styles(highContrast: boolean, options = {}) {
  return Object.fromEntries(
    getCycleNetworkLineStyles({
      highContrast,
      theme: 'light',
      isDirectionsMode: false,
      selectedRouteKey: null,
      ...options,
    }).map((layer) => [layer.id.replace('cycle-network-', ''), layer]),
  );
}

describe('cycle network contrast', () => {
  it('separates route colours from both light and dark imagery at every width stop', () => {
    const high = styles(true);
    const normal = styles(false);
    expect(high.outline.paint!['line-opacity']).toBeGreaterThan(0);
    expect(normal.outline.paint!['line-opacity']).toBe(0);
    expect(high.casing.paint!['line-color']).not.toBe(
      high.outline.paint!['line-color'],
    );
    for (const kind of ['traffic-free', 'on-road', 'ferry', 'other']) {
      expect(high[kind].paint!['line-opacity']).toBe(1);
      const widths = high[kind].paint!['line-width'] as unknown as number[];
      const base = normal[kind].paint!['line-width'] as unknown as number[];
      const casing = high.casing.paint!['line-width'] as unknown as number[];
      const outline = high.outline.paint!['line-width'] as unknown as number[];
      for (const stop of [4, 6]) {
        expect(widths[stop]).toBeGreaterThan(base[stop]);
        expect(casing[stop]).toBeGreaterThan(widths[stop]);
        expect(outline[stop]).toBeGreaterThan(casing[stop]);
      }
      // Colours change, but the route's solid/dashed meaning does not.
      expect(high[kind].paint!['line-dasharray']).toEqual(
        normal[kind].paint!['line-dasharray'],
      );
      expect(high[kind].filter).toEqual(normal[kind].filter);
    }
    expect(styles(true, { theme: 'dark' })).toEqual({
      ...high,
      'selected-casing': expect.objectContaining({
        paint: expect.objectContaining({ 'line-color': '#f8fafc' }),
      }),
    });
  });

  it('keeps selected routes prominent and dims the network during directions', () => {
    for (const highContrast of [false, true]) {
      const selected = styles(highContrast, { selectedRouteKey: 'ncn:1' });
      expect(selected['traffic-free'].paint!['line-opacity']).toEqual([
        'case',
        ['==', ['get', 'routeKey'], 'ncn:1'],
        1,
        0.24,
      ]);
      expect(selected['selected-casing'].filter).toEqual([
        '==',
        ['get', 'routeKey'],
        'ncn:1',
      ]);
      const directions = styles(highContrast, { isDirectionsMode: true });
      expect(directions['traffic-free'].paint!['line-opacity']).toBe(0.12);
      expect(directions.casing.paint!['line-opacity']).toBe(0.16);
      expect(directions['temporary-closure'].filter).toEqual([
        '==',
        ['get', 'openStatus'],
        'temporary-closure',
      ]);
    }
  });
});
