import { describe, expect, it } from 'vitest';
import { windAnchorHasLabel, windGridAnchors } from './wind-grid';

const area = { west: -3.21, east: -3.17, south: 55.94, north: 55.96 };
describe('geographic wind anchors', () => {
  it('labels more arrows on desktop while retaining an unlabelled majority on phones', () => {
    const anchors = windGridAnchors(area, 16);
    const mobile = anchors.filter((a) => windAnchorHasLabel(a.id, true));
    const desktop = anchors.filter((a) => windAnchorHasLabel(a.id, false));
    expect(mobile.length / anchors.length).toBeGreaterThan(0.25);
    expect(mobile.length / anchors.length).toBeLessThan(0.4);
    expect(desktop.length / anchors.length).toBeGreaterThan(0.4);
    expect(desktop.length / anchors.length).toBeLessThan(0.6);
  });

  it('retains geographic identity when the visible area pans', () => {
    const before = windGridAnchors(area, 14);
    const after = windGridAnchors({ ...area, west: -3.2, east: -3.16 }, 14);
    const common = before.filter((a) => after.some((b) => b.id === a.id));
    expect(common.length).toBeGreaterThan(0);
    for (const a of common) expect(after.find((b) => a.id === b.id)).toEqual(a);
  });
  it('keeps anchors across fractional zoom and nests finer zoom levels', () => {
    const before = windGridAnchors(area, 14.1);
    expect(windGridAnchors(area, 14.9)).toEqual(before);
    const finer = windGridAnchors(area, 15);
    for (const a of before) expect(finer.find((b) => b.id === a.id)).toEqual(a);
  });
  it('does not produce anchors outside the visible coverage intersection', () => {
    expect(windGridAnchors({ ...area, west: 0 }, 14)).toEqual([]);
    for (const {
      point: [lng, lat],
    } of windGridAnchors(area, 14)) {
      expect(lng).toBeGreaterThanOrEqual(area.west);
      expect(lng).toBeLessThanOrEqual(area.east);
      expect(lat).toBeGreaterThanOrEqual(area.south);
      expect(lat).toBeLessThanOrEqual(area.north);
    }
  });
});
