import { describe, expect, it } from 'vitest';
import { classifyCyclingPoi } from '@/lib/cycling-poi-classification';

describe('classifyCyclingPoi', () => {
  it('classifies an explicitly tagged bicycle shop', () => {
    expect(classifyCyclingPoi({ shop: 'bicycle' })).toEqual(['shop']);
  });

  it('keeps supported overlapping categories on one feature', () => {
    expect(
      classifyCyclingPoi({
        shop: 'bicycle',
        'service:bicycle:repair': 'yes',
        'service:bicycle:rental': 'yes',
      }),
    ).toEqual(['shop', 'repair', 'hire']);
  });

  it('does not infer services from a bicycle shop', () => {
    expect(classifyCyclingPoi({ shop: 'bicycle' })).not.toContain('repair');
    expect(classifyCyclingPoi({ shop: 'bicycle' })).not.toContain('hire');
  });

  it('ignores broad retail tags without a bicycle signal', () => {
    expect(classifyCyclingPoi({ shop: 'sports' })).toEqual([]);
  });

  it('classifies explicitly potable drinking-water features', () => {
    expect(classifyCyclingPoi({ amenity: 'drinking_water' })).toEqual([
      'water',
    ]);
    expect(
      classifyCyclingPoi({ amenity: 'water_point', drinking_water: 'yes' }),
    ).toEqual(['water']);
  });

  it('keeps a primary cycling-place category ahead of water', () => {
    expect(
      classifyCyclingPoi({
        drinking_water: 'yes',
        shop: 'bicycle',
      }),
    ).toEqual(['shop', 'water']);
  });

  it('excludes features explicitly tagged as not potable', () => {
    expect(
      classifyCyclingPoi({
        amenity: 'drinking_water',
        drinking_water: 'no',
      }),
    ).toEqual([]);
    expect(classifyCyclingPoi({ amenity: 'water_point' })).toEqual([]);
  });
});
