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
});
