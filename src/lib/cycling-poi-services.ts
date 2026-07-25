import type { CyclingPoiPoint } from '@/lib/types';

export const cyclingPoiServices = ['repair', 'pump', 'tools'] as const;

export type CyclingPoiService = (typeof cyclingPoiServices)[number];

function isConfirmedService(value: unknown) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'yes';
}

export function getCyclingPoiServices(
  point: CyclingPoiPoint,
): CyclingPoiService[] {
  const services: CyclingPoiService[] = [];

  if (point.categories.includes('repair')) {
    services.push('repair');
  }
  if (isConfirmedService(point.properties.servicePump)) {
    services.push('pump');
  }
  if (isConfirmedService(point.properties.serviceTools)) {
    services.push('tools');
  }

  return services;
}
