import type { ParkingPoint } from '@/lib/types';
import type { AppLocale } from '@/lib/i18n/locales';
import { translate } from '@/lib/i18n/messages';

const parkingDisplayNames: Readonly<Record<string, string>> = {
  'cec:43': 'Waterloo Place',
  'cec:178': 'Princes Street by Waverley Steps',
  'cec:1320': 'Leith Street by The Newsroom',
};

export function getParkingDisplayName(point: ParkingPoint) {
  return parkingDisplayNames[point.id] ?? point.name;
}

function stripCycleParkingSuffix(name: string) {
  return name.replace(/\s+cycle parking$/i, '').trim();
}

export function formatParkingDisplayName(
  point: ParkingPoint,
  locale: AppLocale = 'en',
) {
  const displayName = getParkingDisplayName(point);
  if (displayName !== point.name || locale === 'en') {
    return displayName;
  }

  const nameSource = point.properties.nameSource;
  if (nameSource === 'source') {
    return displayName;
  }

  if (nameSource === 'junction') {
    const [primary, ...secondaryParts] = displayName.split(' near ');
    const secondary = secondaryParts.join(' near ');
    if (primary && secondary) {
      return translate(locale, 'parkingNameNear', { primary, secondary });
    }
  }

  if (nameSource === 'landmark' && displayName.includes(' by ')) {
    const [primary, ...secondaryParts] = displayName.split(' by ');
    const secondary = secondaryParts.join(' by ');
    if (primary && secondary) {
      return translate(locale, 'parkingNameBy', { primary, secondary });
    }
  }

  if (['landmark', 'place', 'street'].includes(String(nameSource))) {
    return translate(locale, 'parkingNameAt', {
      name: stripCycleParkingSuffix(displayName),
    });
  }

  if (
    nameSource === 'generic' ||
    /^cycle parking(?: \d+)?$/i.test(displayName)
  ) {
    return translate(locale, 'genericParking');
  }

  return displayName;
}
