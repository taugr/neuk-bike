import { isResolvedLocation } from '@/lib/geo';
import type { UserLocation } from '@/lib/types';

export const NOMINATIM_SEARCH_URL =
  'https://nominatim.openstreetmap.org/search';
export const SCOTLAND_VIEWBOX = '-8.7,60.9,-0.5,54.55';

export type PlaceSearchResult = {
  id: string;
  name: string;
  location: UserLocation;
};

type NominatimResult = {
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
  osm_id?: unknown;
  place_id?: unknown;
};

export function buildPlaceSearchUrl(query: string) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '5',
    countrycodes: 'gb',
    viewbox: SCOTLAND_VIEWBOX,
    bounded: '1',
  });

  return `${NOMINATIM_SEARCH_URL}?${params.toString()}`;
}

export function parsePlaceSearchResults(results: unknown): PlaceSearchResult[] {
  if (!Array.isArray(results)) {
    return [];
  }

  return results.flatMap((result, index) => {
    const candidate = result as NominatimResult;
    const latitude = Number(candidate.lat);
    const longitude = Number(candidate.lon);
    const location = { latitude, longitude };

    if (
      !isResolvedLocation(location) ||
      typeof candidate.display_name !== 'string'
    ) {
      return [];
    }

    return [
      {
        id: String(candidate.osm_id ?? candidate.place_id ?? index),
        name: candidate.display_name,
        location,
      },
    ];
  });
}
