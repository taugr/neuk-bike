import { describe, expect, it } from 'vitest';
import { lightningPaths } from './weather-effects';

describe('branching lightning', () => {
  it('keeps a discharge stable, with connected branches and a bounded footprint', () => {
    const paths = lightningPaths(7, 180);
    expect(lightningPaths(7, 180)).toEqual(paths);
    expect(lightningPaths(8, 180)).not.toEqual(paths);
    expect(paths.length).toBeGreaterThan(2);
    for (const branch of paths.slice(1))
      expect(paths[0]).toContainEqual(branch[0]);
    for (const path of paths) {
      expect(path.length).toBeGreaterThan(5);
      for (const [index, p] of path.entries()) {
        expect(Math.abs(p.x)).toBeLessThan(90);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(180);
        if (index) expect(p.y).toBeGreaterThan(path[index - 1].y);
      }
    }
  });
});
