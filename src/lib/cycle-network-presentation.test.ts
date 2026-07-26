import { describe, expect, it } from 'vitest';
import type { CycleNetworkFeature } from '@/lib/cycle-network-data';
import {
  getCycleNetworkCoRoutes,
  getCycleNetworkPopupDetails,
  getCycleNetworkRouteBundles,
  getCycleNetworkRouteIdentity,
} from '@/lib/cycle-network-presentation';

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

function routeFeature({
  coordinates,
  id,
  routeNumber,
  routeType = 'ncn',
}: {
  coordinates: [number, number][];
  id: string;
  routeNumber?: number;
  routeType?: CycleNetworkFeature['properties']['routeType'];
}): CycleNetworkFeature {
  return {
    ...feature,
    geometry: { coordinates, type: 'LineString' },
    id,
    properties: {
      ...feature.properties,
      linkNumber: routeType === 'link' ? routeNumber : undefined,
      routeNumber: routeType === 'link' ? undefined : routeNumber,
      routeType,
    },
  };
}

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

describe('cycle network route identities', () => {
  it('uses stable NCN and RCN identities and associates numbered links with NCN routes', () => {
    expect(getCycleNetworkRouteIdentity(feature)).toEqual({
      key: 'ncn:1',
      routeNumber: 1,
      routeType: 'ncn',
      shieldType: 'ncn',
    });
    expect(
      getCycleNetworkRouteIdentity(
        routeFeature({
          coordinates: [
            [-3.2, 55.95],
            [-3.19, 55.96],
          ],
          id: 'rcn:12',
          routeNumber: 12,
          routeType: 'rcn',
        }),
      ),
    ).toMatchObject({ key: 'rcn:12', routeNumber: 12, routeType: 'rcn' });
    expect(
      getCycleNetworkRouteIdentity(
        routeFeature({
          coordinates: [
            [-3.2, 55.95],
            [-3.19, 55.96],
          ],
          id: 'link:1',
          routeNumber: 1,
          routeType: 'link',
        }),
      ),
    ).toEqual({
      key: 'ncn:1',
      routeNumber: 1,
      routeType: 'ncn',
      shieldType: 'link',
    });
  });

  it('rejects unknown, missing, non-positive, and malformed route identities', () => {
    expect(
      getCycleNetworkRouteIdentity(
        routeFeature({
          coordinates: [
            [-3.2, 55.95],
            [-3.19, 55.96],
          ],
          id: 'unknown',
          routeNumber: 1,
          routeType: 'unknown',
        }),
      ),
    ).toBeNull();
    expect(
      getCycleNetworkRouteIdentity(
        routeFeature({
          coordinates: [
            [-3.2, 55.95],
            [-3.19, 55.96],
          ],
          id: 'missing',
          routeType: 'ncn',
        }),
      ),
    ).toBeNull();
    expect(
      getCycleNetworkRouteIdentity(
        routeFeature({
          coordinates: [
            [-3.2, 55.95],
            [-3.19, 55.96],
          ],
          id: 'zero',
          routeNumber: 0,
        }),
      ),
    ).toBeNull();
  });
});

describe('getCycleNetworkRouteBundles', () => {
  const sharedCoordinate: [number, number] = [-2.984242, 54.84133];
  const route6 = routeFeature({
    coordinates: [[-2.9842, 54.84], sharedCoordinate],
    id: 'ncn:6',
    routeNumber: 6,
  });
  const route10 = routeFeature({
    coordinates: [sharedCoordinate, [-2.98424, 54.842]],
    id: 'ncn:10',
    routeNumber: 10,
  });

  it('groups aligned routes at the same anchor and orders their identities', () => {
    expect(getCycleNetworkRouteBundles([route10, route6])).toEqual([
      expect.objectContaining({
        featureIds: ['ncn:10', 'ncn:6'],
        kinds: ['traffic-free'],
        routes: [
          expect.objectContaining({ key: 'ncn:6', routeNumber: 6 }),
          expect.objectContaining({ key: 'ncn:10', routeNumber: 10 }),
        ],
      }),
    ]);
  });

  it('does not bundle close parallel routes, routes crossing at an angle, or duplicate identities', () => {
    const closeParallel = routeFeature({
      coordinates: [
        [-2.98422, 54.84133],
        [-2.98422, 54.842],
      ],
      id: 'ncn:20',
      routeNumber: 20,
    });
    const crossing = routeFeature({
      coordinates: [[-2.985, 54.84133], sharedCoordinate],
      id: 'ncn:30',
      routeNumber: 30,
    });
    expect(getCycleNetworkRouteBundles([route6, closeParallel])).toEqual([]);
    expect(getCycleNetworkRouteBundles([route6, crossing])).toEqual([]);
    expect(getCycleNetworkRouteBundles([route6, route6])).toEqual([]);
  });

  it('keeps independently aligned route pairs separate at a crossing', () => {
    const route30 = routeFeature({
      coordinates: [[-2.985, 54.84133], sharedCoordinate],
      id: 'ncn:30',
      routeNumber: 30,
    });
    const route40 = routeFeature({
      coordinates: [sharedCoordinate, [-2.9835, 54.84133]],
      id: 'ncn:40',
      routeNumber: 40,
    });
    const bundles = getCycleNetworkRouteBundles([
      route6,
      route10,
      route30,
      route40,
    ]);
    expect(
      bundles.map((bundle) => bundle.routes.map((route) => route.routeNumber)),
    ).toEqual([
      [6, 10],
      [30, 40],
    ]);
  });

  it('deduplicates repeated chunk features and reports co-routes for popup disclosure', () => {
    const bundles = getCycleNetworkRouteBundles([route6, route10, route10]);
    expect(bundles).toHaveLength(1);
    expect(getCycleNetworkCoRoutes(route6, bundles)).toEqual([
      expect.objectContaining({ key: 'ncn:10', routeNumber: 10 }),
    ]);
    expect(
      getCycleNetworkCoRoutes(
        routeFeature({
          coordinates: [
            [-2.98424, 54.8412],
            [-2.98424, 54.842],
          ],
          id: 'ncn:6:nearby-segment',
          routeNumber: 6,
        }),
        bundles,
        sharedCoordinate,
      ),
    ).toEqual([expect.objectContaining({ key: 'ncn:10', routeNumber: 10 })]);
    expect(getCycleNetworkCoRoutes(route6, bundles, [-2.9842, 54.82])).toEqual(
      [],
    );
    expect(getCycleNetworkCoRoutes(feature, bundles)).toEqual([]);
  });
});
