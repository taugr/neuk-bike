import { describe, expect, it } from 'vitest';
import type { CycleNetworkFeature } from '@/lib/cycle-network-data';
import { getCycleNetworkPopupDetails } from '@/lib/cycle-network-presentation';

const feature: CycleNetworkFeature = {
  geometry: {
    coordinates: [
      [-3.2, 55.95],
      [-3.19, 55.96],
    ],
    type: 'LineString',
  },
  id: 'ncn:test',
  properties: {
    greenway: true,
    kind: 'traffic-free',
    lighting: 'fully-lit',
    openStatus: 'open',
    quality: 'mountain-bike-only',
    routeNumber: 1,
    routeType: 'ncn',
    segmentId: 1,
    surface: 'paving-slabs',
  },
  type: 'Feature',
};

describe('getCycleNetworkPopupDetails', () => {
  it('turns normalized source enums into friendly English labels', () => {
    expect(getCycleNetworkPopupDetails(feature, 'en')).toEqual([
      { icon: 'surface', label: 'Surface', value: 'Paving slabs' },
      {
        icon: 'quality',
        label: 'Ride quality',
        value: 'Mountain bikes only',
      },
      { icon: 'lighting', label: 'Lighting', value: 'Fully lit' },
    ]);
  });

  it('localizes the values as well as their headings', () => {
    expect(getCycleNetworkPopupDetails(feature, 'es')).toEqual([
      { icon: 'surface', label: 'Superficie', value: 'Losas de pavimento' },
      {
        icon: 'quality',
        label: 'Calidad de rodadura',
        value: 'Solo bicicletas de montaña',
      },
      {
        icon: 'lighting',
        label: 'Iluminación',
        value: 'Totalmente iluminada',
      },
    ]);
  });

  it('simplifies the source Standard grade and distinguishes an unlit route', () => {
    expect(
      getCycleNetworkPopupDetails(
        {
          ...feature,
          properties: {
            ...feature.properties,
            lighting: 'unlit',
            quality: 'standard',
          },
        },
        'en',
      ),
    ).toContainEqual({
      icon: 'quality',
      label: 'Ride quality',
      value: 'Average',
    });
    expect(
      getCycleNetworkPopupDetails(
        {
          ...feature,
          properties: { ...feature.properties, lighting: 'unlit' },
        },
        'en',
      ),
    ).toContainEqual({
      icon: 'lighting-off',
      label: 'Lighting',
      value: 'Unlit',
    });
  });
});
