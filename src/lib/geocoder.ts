import { isResolvedLocation } from '@/lib/geo';
import { localeDetails, type AppLocale } from '@/lib/i18n/locales';
import type { UserLocation } from '@/lib/types';

export const PHOTON_SEARCH_URL = 'https://photon.komoot.io/api/';
export const PARKING_COVERAGE_BBOX = '-18.2,27.5,4.4,60.9';

export type PlaceSearchResult = {
  id: string;
  name: string;
  location: UserLocation;
};

type PhotonFeature = {
  geometry?: {
    coordinates?: unknown;
  };
  properties?: {
    city?: unknown;
    country?: unknown;
    county?: unknown;
    district?: unknown;
    name?: unknown;
    osm_id?: unknown;
    osm_type?: unknown;
    postcode?: unknown;
    state?: unknown;
    street?: unknown;
  };
};

type PhotonResponse = {
  features?: unknown;
};

function firstLanguage(locale: AppLocale) {
  return localeDetails[locale].placeSearchLanguages.split(',')[0] ?? locale;
}

export function buildPlaceSearchUrl(
  query: string,
  locale: AppLocale = 'en',
  focus?: UserLocation,
) {
  const params = new URLSearchParams({
    bbox: PARKING_COVERAGE_BBOX,
    lang: firstLanguage(locale),
    limit: '5',
    q: query,
  });

  for (const countryCode of ['GB', 'IE', 'ES']) {
    params.append('countrycode', countryCode);
  }

  if (focus && isResolvedLocation(focus)) {
    params.set('lat', String(focus.latitude));
    params.set('lon', String(focus.longitude));
  }

  return `${PHOTON_SEARCH_URL}?${params.toString()}`;
}

function stringProperty(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function photonResultName(feature: PhotonFeature) {
  const properties = feature.properties ?? {};
  const parts = [
    properties.name,
    properties.postcode,
    properties.street,
    properties.city,
    properties.district,
    properties.county,
    properties.state,
    properties.country,
  ]
    .map(stringProperty)
    .filter((part): part is string => part !== null)
    .filter(
      (part, index, values) =>
        values.findIndex(
          (candidate) =>
            candidate.toLocaleLowerCase() === part.toLocaleLowerCase(),
        ) === index,
    );

  return parts.length > 0 ? parts.join(', ') : null;
}

export function parsePlaceSearchResults(
  response: unknown,
): PlaceSearchResult[] {
  const features = (response as PhotonResponse)?.features;
  if (!Array.isArray(features)) {
    return [];
  }

  return features
    .flatMap((value, index) => {
      const feature = value as PhotonFeature;
      const coordinates = feature.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return [];
      }

      const location = {
        latitude: Number(coordinates[1]),
        longitude: Number(coordinates[0]),
      };
      const name = photonResultName(feature);
      if (!isResolvedLocation(location) || !name) {
        return [];
      }

      const osmId = feature.properties?.osm_id;
      const osmType = stringProperty(feature.properties?.osm_type) ?? 'feature';

      return [
        {
          id: `${osmType}:${String(osmId ?? index)}`,
          name,
          location,
        },
      ];
    })
    .filter(
      (result, index, results) =>
        results.findIndex(
          (candidate) =>
            candidate.name.toLocaleLowerCase() ===
            result.name.toLocaleLowerCase(),
        ) === index,
    );
}
