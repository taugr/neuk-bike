import type { ParkingPoint } from '@/lib/types';

const googleStreetViewEmbedBaseUrl =
  'https://www.google.com/maps/embed/v1/streetview';
const googleMapsSearchBaseUrl = 'https://www.google.com/maps/search/';

export function buildGoogleStreetViewEmbedUrl(
  point: ParkingPoint,
  apiKey: string,
): string {
  const params = new URLSearchParams({
    key: apiKey,
    location: `${point.latitude},${point.longitude}`,
    fov: '80',
    pitch: '0',
  });

  return `${googleStreetViewEmbedBaseUrl}?${params.toString()}`;
}

export function buildGoogleMapsLocationUrl(point: ParkingPoint): string {
  const params = new URLSearchParams({
    api: '1',
    query: `${point.latitude},${point.longitude}`,
  });

  return `${googleMapsSearchBaseUrl}?${params.toString()}`;
}
