import { describe, expect, it } from 'vitest';
import {
  getCyclingPoiWebsite,
  normalizeCyclingPoiWebsite,
} from '@/lib/cycling-poi-website';
import type { CyclingPoiPoint, ParkingPoint } from '@/lib/types';

describe('normalizeCyclingPoiWebsite', () => {
  it.each([
    ['https://example.com/bikes', 'https://example.com/bikes'],
    ['http://example.com', 'http://example.com/'],
    ['www.example.com', 'https://www.example.com/'],
    ['not a url; bikes.example.com', 'https://bikes.example.com/'],
  ])('normalizes %s', (value, expected) => {
    expect(normalizeCyclingPoiWebsite(value)).toBe(expected);
  });

  it.each([
    null,
    '',
    'javascript:alert(1)',
    'mailto:shop@example.com',
    'https://user:secret@example.com',
  ])('rejects unsafe or empty value %j', (value) => {
    expect(normalizeCyclingPoiWebsite(value)).toBeNull();
  });
});

describe('getCyclingPoiWebsite', () => {
  const parking: ParkingPoint = {
    id: 'parking',
    latitude: 55.95,
    longitude: -3.19,
    name: 'Parking',
    properties: { website: 'https://parking.example.com' },
    sourceId: 'osm',
  };
  const shop: CyclingPoiPoint = {
    ...parking,
    categories: ['shop'],
    id: 'shop',
    name: 'Bike shop',
  };

  it('returns a valid cycling-place website only', () => {
    expect(getCyclingPoiWebsite(parking)).toBeNull();
    expect(getCyclingPoiWebsite(shop)).toBe('https://parking.example.com/');
  });
});
