import type { ParkingPoint } from '@/lib/types';

const googleStreetViewEmbedBaseUrl =
  'https://www.google.com/maps/embed/v1/streetview';
const googleMapsStreetViewBaseUrl = 'https://www.google.com/maps/@';

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

export function buildGoogleStreetViewMapsUrl(point: ParkingPoint): string {
  const params = new URLSearchParams({
    api: '1',
    map_action: 'pano',
    viewpoint: `${point.latitude},${point.longitude}`,
  });

  return `${googleMapsStreetViewBaseUrl}?${params.toString()}`;
}
