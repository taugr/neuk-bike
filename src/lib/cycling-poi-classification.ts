import type { CyclingPoiCategory } from '@/lib/types';

export function classifyCyclingPoi(
  tags: Record<string, string | undefined>,
): CyclingPoiCategory[] {
  const categories: CyclingPoiCategory[] = [];

  if (tags.shop === 'bicycle') {
    categories.push('shop');
  }
  if (
    tags.amenity === 'bicycle_repair_station' ||
    tags['service:bicycle:repair'] === 'yes'
  ) {
    categories.push('repair');
  }
  if (
    tags.amenity === 'bicycle_rental' ||
    tags['service:bicycle:rental'] === 'yes'
  ) {
    categories.push('hire');
  }

  return categories;
}
