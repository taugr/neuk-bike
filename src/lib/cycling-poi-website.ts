import { isCyclingPoiPoint, type ParkingPoint } from '@/lib/types';

export function normalizeCyclingPoiWebsite(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  for (const rawCandidate of value.split(';')) {
    const candidate = rawCandidate.trim();
    if (!candidate) {
      continue;
    }

    const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(candidate)
      ? candidate
      : `https://${candidate}`;

    try {
      const url = new URL(withProtocol);
      if (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        (url.hostname.includes('.') || url.hostname.includes(':')) &&
        !url.username &&
        !url.password
      ) {
        return url.toString();
      }
    } catch {
      // Try the next semicolon-separated value.
    }
  }

  return null;
}

export function getCyclingPoiWebsite(point: ParkingPoint) {
  if (!isCyclingPoiPoint(point)) {
    return null;
  }

  return normalizeCyclingPoiWebsite(point.properties.website);
}
