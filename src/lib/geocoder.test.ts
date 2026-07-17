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
