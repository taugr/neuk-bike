import { describe, expect, it } from 'vitest';
import {
  buildPlaceSearchUrl,
  PARKING_COVERAGE_BBOX,
  parsePlaceSearchResults,
} from '@/lib/geocoder';

describe('place search', () => {
  it('bounds Photon requests to the UK, Ireland and Spain', () => {
    const url = new URL(buildPlaceSearchUrl('Madrid'));

    expect(url.searchParams.get('bbox')).toBe(PARKING_COVERAGE_BBOX);
    expect(url.searchParams.getAll('countrycode')).toEqual(['GB', 'IE', 'ES']);
    expect(url.searchParams.get('q')).toBe('Madrid');
    expect(url.searchParams.get('lang')).toBe('en');
    expect(url.searchParams.get('limit')).toBe('5');
  });

  it('requests localized place names and biases results to the current map area', () => {
    const url = new URL(
      buildPlaceSearchUrl('Dùn Èideann', 'gd', {
        latitude: 55.9533,
        longitude: -3.1883,
      }),
    );

    expect(url.searchParams.get('lang')).toBe('gd');
    expect(url.searchParams.get('lat')).toBe('55.9533');
    expect(url.searchParams.get('lon')).toBe('-3.1883');
    expect(
      new URL(buildPlaceSearchUrl('Madrid', 'es')).searchParams.get('lang'),
    ).toBe('es');
  });

  it('parses valid Photon results and rejects malformed locations', () => {
    expect(
      parsePlaceSearchResults({
        features: [
          {
            geometry: { coordinates: [-2.2426, 53.4808] },
            properties: {
              country: 'United Kingdom',
              name: 'Manchester',
              osm_id: 1,
              osm_type: 'R',
              state: 'England',
            },
          },
          {
            geometry: { coordinates: [-2, 'not-a-number'] },
            properties: { name: 'Invalid' },
          },
        ],
      }),
    ).toEqual([
      {
        id: 'R:1',
        location: { latitude: 53.4808, longitude: -2.2426 },
        name: 'Manchester, England, United Kingdom',
      },
    ]);
  });

  it('formats and deduplicates equivalent suggestions', () => {
    expect(
      parsePlaceSearchResults({
        features: [
          {
            geometry: { coordinates: [-3.1883, 55.9533] },
            properties: {
              city: 'Edinburgh',
              country: 'United Kingdom',
              name: 'EH1 1BB',
              postcode: 'EH1 1BB',
            },
          },
          {
            geometry: { coordinates: [-3.1882, 55.9534] },
            properties: {
              city: 'Edinburgh',
              country: 'United Kingdom',
              name: 'EH1 1BB',
              osm_id: 2,
              postcode: 'EH1 1BB',
            },
          },
        ],
      }),
    ).toEqual([
      {
        id: 'feature:0',
        location: { latitude: 55.9533, longitude: -3.1883 },
        name: 'EH1 1BB, Edinburgh, United Kingdom',
      },
    ]);
  });
});
