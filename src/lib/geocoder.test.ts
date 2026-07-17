import { describe, expect, it } from 'vitest';
import {
  buildPlaceSearchUrl,
  PARKING_COVERAGE_VIEWBOX,
  parsePlaceSearchResults,
} from '@/lib/geocoder';

describe('place search', () => {
  it('bounds Nominatim requests to the UK, Ireland and Spain', () => {
    const url = new URL(buildPlaceSearchUrl('Madrid'));

    expect(url.searchParams.get('viewbox')).toBe(PARKING_COVERAGE_VIEWBOX);
    expect(url.searchParams.get('bounded')).toBe('1');
    expect(url.searchParams.get('countrycodes')).toBe('gb,ie,es');
    expect(url.searchParams.get('q')).toBe('Madrid');
    expect(url.searchParams.get('accept-language')).toBe('en');
  });

  it('requests localized place names with an English fallback', () => {
    expect(
      new URL(buildPlaceSearchUrl('Dùn Èideann', 'gd')).searchParams.get(
        'accept-language',
      ),
    ).toBe('gd,en');
    expect(
      new URL(buildPlaceSearchUrl('Madrid', 'es')).searchParams.get(
        'accept-language',
      ),
    ).toBe('es,en');
  });

  it('parses valid Nominatim results and rejects malformed locations', () => {
    expect(
      parsePlaceSearchResults([
        {
          display_name: 'Manchester, England, United Kingdom',
          lat: '53.4808',
          lon: '-2.2426',
          osm_id: 1,
        },
        { display_name: 'Invalid', lat: 'not-a-number', lon: '-2' },
      ]),
    ).toEqual([
      {
        id: '1',
        location: { latitude: 53.4808, longitude: -2.2426 },
        name: 'Manchester, England, United Kingdom',
      },
    ]);
  });
});
