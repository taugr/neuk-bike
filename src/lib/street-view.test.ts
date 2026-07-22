import { describe, expect, it } from 'vitest';
import {
  buildGoogleMapsLocationUrl,
  buildGoogleStreetViewEmbedUrl,
} from '@/lib/street-view';
import type { ParkingPoint } from '@/lib/types';

const point: ParkingPoint = {
  id: 'parking-1',
  name: 'Cycle parking 1',
  latitude: 55.9533,
  longitude: -3.1883,
  properties: {},
  sourceId: 'test',
};

describe('street view links', () => {
  it('builds a Google Maps Embed Street View URL', () => {
    const url = new URL(buildGoogleStreetViewEmbedUrl(point, 'test key'));

    expect(url.origin).toBe('https://www.google.com');
    expect(url.pathname).toBe('/maps/embed/v1/streetview');
    expect(url.searchParams.get('key')).toBe('test key');
    expect(url.searchParams.get('location')).toBe('55.9533,-3.1883');
    expect(url.searchParams.get('fov')).toBe('80');
    expect(url.searchParams.get('pitch')).toBe('0');
  });

  it('builds a keyless Google Maps location URL', () => {
    const url = new URL(buildGoogleMapsLocationUrl(point));

    expect(url.origin).toBe('https://www.google.com');
    expect(url.pathname).toBe('/maps/search/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('query')).toBe('55.9533,-3.1883');
  });
});
