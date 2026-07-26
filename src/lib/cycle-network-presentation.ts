import type { AppLocale } from '@/lib/i18n/locales';
import { translate, type MessageKey } from '@/lib/i18n/messages';
import type {
  CycleNetworkFeature,
  CycleNetworkKind,
  CycleNetworkLighting,
  CycleNetworkQuality,
  CycleNetworkRouteType,
  CycleNetworkSurface,
} from '@/lib/cycle-network-data';

export type CycleNetworkRouteIdentity = {
  key: string;
  routeNumber: number;
  routeType: 'ncn' | 'rcn';
  shieldType: Exclude<CycleNetworkRouteType, 'unknown'>;
};

export type CycleNetworkRouteBundle = {
  anchor: [number, number];
  featureIds: string[];
  key: string;
  kinds: CycleNetworkKind[];
  routes: CycleNetworkRouteIdentity[];
};

type CoordinateOccurrence = {
  bearings: number[];
  coordinate: [number, number];
  featureId: string;
  identity: CycleNetworkRouteIdentity;
  kind: CycleNetworkKind;
};

const coordinateTolerance = 0.00001;
const maximumAlignedBearingDifference = 20;
const bundleDensityCellSize = 0.01;
const maximumCoRouteBundleDistance = bundleDensityCellSize * Math.SQRT2;

function isValidRouteNumber(value: number | undefined): value is number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0;
}

export function getCycleNetworkRouteIdentity(
  feature: CycleNetworkFeature,
): CycleNetworkRouteIdentity | null {
  const { linkNumber, routeNumber, routeType } = feature.properties;
  if (routeType === 'link' && isValidRouteNumber(linkNumber)) {
    return {
      key: `ncn:${linkNumber}`,
      routeNumber: linkNumber,
      routeType: 'ncn',
      shieldType: 'link',
    };
  }
  if (
    (routeType === 'ncn' || routeType === 'rcn') &&
    isValidRouteNumber(routeNumber)
  ) {
    return {
      key: `${routeType}:${routeNumber}`,
      routeNumber,
      routeType,
      shieldType: routeType,
    };
  }
  return null;
}

function getGeometryLines(feature: CycleNetworkFeature): [number, number][][] {
  return feature.geometry.type === 'LineString'
    ? [feature.geometry.coordinates as [number, number][]]
    : (feature.geometry.coordinates as [number, number][][]);
}

function getCoordinateKey([longitude, latitude]: [number, number]) {
  return `${Math.round(longitude / coordinateTolerance)}:${Math.round(
    latitude / coordinateTolerance,
  )}`;
}

function getBearing(from: [number, number], to: [number, number]): number {
  const latitudeRadians = (from[1] * Math.PI) / 180;
  const longitudeDelta = (to[0] - from[0]) * Math.cos(latitudeRadians);
  const latitudeDelta = to[1] - from[1];
  return (
    ((Math.atan2(longitudeDelta, latitudeDelta) * 180) / Math.PI + 360) % 360
  );
}

function areBearingsAligned(first: number, second: number) {
  const difference = Math.abs(first - second);
  const smallestDifference = Math.min(difference, 360 - difference);
  return (
    smallestDifference <= maximumAlignedBearingDifference ||
    smallestDifference >= 180 - maximumAlignedBearingDifference
  );
}

function areOccurrencesAligned(
  first: CoordinateOccurrence,
  second: CoordinateOccurrence,
) {
  return first.bearings.some((firstBearing) =>
    second.bearings.some((secondBearing) =>
      areBearingsAligned(firstBearing, secondBearing),
    ),
  );
}

function preferMainRouteShield(
  current: CycleNetworkRouteIdentity | undefined,
  candidate: CycleNetworkRouteIdentity,
) {
  if (!current || current.shieldType === 'link') return candidate;
  return current;
}

export function getCycleNetworkRouteBundles(
  features: CycleNetworkFeature[],
): CycleNetworkRouteBundle[] {
  const occurrencesByCoordinate = new Map<string, CoordinateOccurrence[]>();
  const uniqueFeatures = new Map(
    features.map((feature) => [feature.id, feature]),
  );

  for (const feature of uniqueFeatures.values()) {
    const identity = getCycleNetworkRouteIdentity(feature);
    if (!identity) continue;
    for (const line of getGeometryLines(feature)) {
      line.forEach((coordinate, index) => {
        const bearings = [line[index - 1], line[index + 1]]
          .filter((neighbor): neighbor is [number, number] => Boolean(neighbor))
          .map((neighbor) => getBearing(coordinate, neighbor));
        if (bearings.length === 0) return;
        const occurrence: CoordinateOccurrence = {
          bearings,
          coordinate,
          featureId: feature.id,
          identity,
          kind: feature.properties.kind,
        };
        const key = getCoordinateKey(coordinate);
        const current = occurrencesByCoordinate.get(key) ?? [];
        current.push(occurrence);
        occurrencesByCoordinate.set(key, current);
      });
    }
  }

  const bundlesByDensityCell = new Map<string, CycleNetworkRouteBundle>();
  const orderedCoordinates = [...occurrencesByCoordinate.entries()].sort(
    ([first], [second]) => first.localeCompare(second),
  );
  for (const [coordinateKey, occurrences] of orderedCoordinates) {
    const alignedNeighbors = new Map<
      CoordinateOccurrence,
      Set<CoordinateOccurrence>
    >();
    for (let firstIndex = 0; firstIndex < occurrences.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < occurrences.length;
        secondIndex += 1
      ) {
        const first = occurrences[firstIndex];
        const second = occurrences[secondIndex];
        if (
          first.identity.key !== second.identity.key &&
          areOccurrencesAligned(first, second)
        ) {
          const firstNeighbors = alignedNeighbors.get(first) ?? new Set();
          firstNeighbors.add(second);
          alignedNeighbors.set(first, firstNeighbors);
          const secondNeighbors = alignedNeighbors.get(second) ?? new Set();
          secondNeighbors.add(first);
          alignedNeighbors.set(second, secondNeighbors);
        }
      }
    }
    const remainingOccurrences = new Set(alignedNeighbors.keys());
    while (remainingOccurrences.size > 0) {
      const firstOccurrence = remainingOccurrences.values().next().value;
      if (!firstOccurrence) break;
      const alignedOccurrences = new Set<CoordinateOccurrence>();
      const pendingOccurrences = [firstOccurrence];
      while (pendingOccurrences.length > 0) {
        const occurrence = pendingOccurrences.pop();
        if (!occurrence || alignedOccurrences.has(occurrence)) continue;
        alignedOccurrences.add(occurrence);
        remainingOccurrences.delete(occurrence);
        pendingOccurrences.push(...(alignedNeighbors.get(occurrence) ?? []));
      }
      if (alignedOccurrences.size < 2) continue;

      const routesByKey = new Map<string, CycleNetworkRouteIdentity>();
      const featureIds = new Set<string>();
      const kinds = new Set<CycleNetworkKind>();
      let longitude = 0;
      let latitude = 0;
      for (const occurrence of alignedOccurrences) {
        routesByKey.set(
          occurrence.identity.key,
          preferMainRouteShield(
            routesByKey.get(occurrence.identity.key),
            occurrence.identity,
          ),
        );
        featureIds.add(occurrence.featureId);
        kinds.add(occurrence.kind);
        longitude += occurrence.coordinate[0];
        latitude += occurrence.coordinate[1];
      }
      const routes = [...routesByKey.values()].sort(
        (first, second) =>
          first.routeNumber - second.routeNumber ||
          first.routeType.localeCompare(second.routeType),
      );
      if (routes.length < 2) continue;

      const anchor: [number, number] = [
        longitude / alignedOccurrences.size,
        latitude / alignedOccurrences.size,
      ];
      const routeKey = routes.map((route) => route.key).join('+');
      const densityKey = `${routeKey}:${Math.floor(
        anchor[0] / bundleDensityCellSize,
      )}:${Math.floor(anchor[1] / bundleDensityCellSize)}`;
      if (bundlesByDensityCell.has(densityKey)) continue;
      bundlesByDensityCell.set(densityKey, {
        anchor,
        featureIds: [...featureIds].sort(),
        key: `${routeKey}:${coordinateKey}`,
        kinds: [...kinds].sort(),
        routes,
      });
    }
  }

  return [...bundlesByDensityCell.values()];
}

export function getCycleNetworkCoRoutes(
  feature: CycleNetworkFeature,
  bundles: CycleNetworkRouteBundle[],
  coordinate?: [number, number],
) {
  const selectedIdentity = getCycleNetworkRouteIdentity(feature);
  if (!selectedIdentity) return [];
  const routesByKey = new Map<string, CycleNetworkRouteIdentity>();
  const identityBundles = bundles.filter((bundle) =>
    bundle.routes.some((route) => route.key === selectedIdentity.key),
  );
  const closestIdentityBundle = coordinate
    ? identityBundles.reduce<{
        bundle: CycleNetworkRouteBundle;
        distanceSquared: number;
      } | null>((closest, bundle) => {
        const distanceSquared =
          (bundle.anchor[0] - coordinate[0]) ** 2 +
          (bundle.anchor[1] - coordinate[1]) ** 2;
        return !closest || distanceSquared < closest.distanceSquared
          ? { bundle, distanceSquared }
          : closest;
      }, null)
    : null;
  const relevantBundles = coordinate
    ? closestIdentityBundle &&
      closestIdentityBundle.distanceSquared <= maximumCoRouteBundleDistance ** 2
      ? [closestIdentityBundle.bundle]
      : []
    : identityBundles.filter((bundle) =>
        bundle.featureIds.includes(feature.id),
      );
  for (const bundle of relevantBundles) {
    for (const route of bundle.routes) {
      if (route.key !== selectedIdentity.key) routesByKey.set(route.key, route);
    }
  }
  return [...routesByKey.values()].sort(
    (first, second) => first.routeNumber - second.routeNumber,
  );
}

const surfaceMessageKeys: Record<CycleNetworkSurface, MessageKey> = {
  asphalt: 'cycleNetworkSurfaceAsphalt',
  'bare-earth': 'cycleNetworkSurfaceBareEarth',
  cobbles: 'cycleNetworkSurfaceCobbles',
  concrete: 'cycleNetworkSurfaceConcrete',
  'flexible-surface': 'cycleNetworkSurfaceFlexible',
  grass: 'cycleNetworkSurfaceGrass',
  other: 'cycleNetworkSurfaceOther',
  'paving-blocks': 'cycleNetworkSurfacePavingBlocks',
  'paving-slabs': 'cycleNetworkSurfacePavingSlabs',
  rocky: 'cycleNetworkSurfaceRocky',
  'unsealed-firm': 'cycleNetworkSurfaceUnsealedFirm',
  'unsealed-loose': 'cycleNetworkSurfaceUnsealedLoose',
};

const qualityMessageKeys: Record<CycleNetworkQuality, MessageKey> = {
  acceptable: 'cycleNetworkQualityAcceptable',
  'mountain-bike-only': 'cycleNetworkQualityMountainBikeOnly',
  rough: 'cycleNetworkQualityRough',
  smooth: 'cycleNetworkQualitySmooth',
  standard: 'cycleNetworkQualityStandard',
};

const lightingMessageKeys: Record<CycleNetworkLighting, MessageKey> = {
  'fully-lit': 'cycleNetworkLightingFullyLit',
  'partly-lit': 'cycleNetworkLightingPartlyLit',
  unlit: 'cycleNetworkLightingUnlit',
};

export type CycleNetworkPopupDetail = {
  icon: 'lighting' | 'lighting-off' | 'quality' | 'surface';
  label: string;
  value: string;
};

export function getCycleNetworkPopupDetails(
  feature: CycleNetworkFeature,
  locale: AppLocale,
) {
  const details: CycleNetworkPopupDetail[] = [];
  if (feature.properties.surface) {
    details.push({
      icon: 'surface',
      label: translate(locale, 'cycleNetworkSurface'),
      value: translate(locale, surfaceMessageKeys[feature.properties.surface]),
    });
  }
  if (feature.properties.quality) {
    details.push({
      icon: 'quality',
      label: translate(locale, 'cycleNetworkQuality'),
      value: translate(locale, qualityMessageKeys[feature.properties.quality]),
    });
  }
  if (feature.properties.lighting) {
    details.push({
      icon:
        feature.properties.lighting === 'unlit' ? 'lighting-off' : 'lighting',
      label: translate(locale, 'cycleNetworkLighting'),
      value: translate(
        locale,
        lightingMessageKeys[feature.properties.lighting],
      ),
    });
  }
  return details;
}
