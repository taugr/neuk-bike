import type { AppLocale } from '@/lib/i18n/locales';
import { translate, type MessageKey } from '@/lib/i18n/messages';
import type {
  CycleNetworkFeature,
  CycleNetworkLighting,
  CycleNetworkQuality,
  CycleNetworkSurface,
} from '@/lib/cycle-network-data';

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
