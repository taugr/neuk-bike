import { formatDistance } from '@/lib/geo';
import type { AppLocale } from '@/lib/i18n/locales';
import { translate } from '@/lib/i18n/messages';
import type { ParkingPoint } from '@/lib/types';

type ParkingDetail = {
  kind: 'access' | 'cover' | 'distance' | 'spaces' | 'type';
  label: string;
  value: string;
};

export type ParkingPopupTone =
  | 'amber'
  | 'green'
  | 'muted'
  | 'neutral'
  | 'restricted'
  | 'teal';

export type ParkingPopupIcon =
  | 'access-open'
  | 'building'
  | 'covered'
  | 'customer'
  | 'distance'
  | 'fixture'
  | 'not-covered'
  | 'parking'
  | 'restricted'
  | 'stand'
  | 'storage'
  | 'university'
  | 'unknown';

type ParkingPopupMetric = {
  icon: ParkingPopupIcon;
  kind: 'distance';
  label: string;
  tone: ParkingPopupTone;
  value: string;
};

export type ParkingPopupDetail = {
  emphasis?: string;
  icon: ParkingPopupIcon;
  kind: 'access' | 'cover' | 'spaces' | 'type';
  label: string;
  tone: ParkingPopupTone;
  value: string;
};

export type ParkingPopupDetails = {
  details: ParkingPopupDetail[];
  metrics: ParkingPopupMetric[];
};

function normalizeText(value: string | number | boolean | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function formatCapacity(
  value: string | number | boolean | null | undefined,
  locale: AppLocale,
) {
  return typeof value === 'number' && value > 0
    ? translate(locale, 'spacesCount', { count: value })
    : translate(locale, 'notListed');
}

function formatCovered(
  value: string | number | boolean | null | undefined,
  locale: AppLocale,
) {
  if (value === 'yes') {
    return translate(locale, 'covered');
  }

  if (value === 'no') {
    return translate(locale, 'notCovered');
  }

  return translate(locale, 'notListed');
}

function getDistanceTone(distance: number | undefined): ParkingPopupTone {
  if (typeof distance !== 'number') {
    return 'neutral';
  }

  if (distance < 250) {
    return 'green';
  }

  if (distance < 1_000) {
    return 'amber';
  }

  return 'muted';
}

function getCapacityTone(
  value: string | number | boolean | null | undefined,
): ParkingPopupTone {
  if (typeof value !== 'number' || value <= 0) {
    return 'neutral';
  }

  if (value <= 4) {
    return 'amber';
  }

  if (value <= 10) {
    return 'teal';
  }

  return 'green';
}

function formatCapacityDetail(
  value: string | number | boolean | null | undefined,
  locale: AppLocale,
): ParkingPopupDetail | null {
  const hasCapacity = typeof value === 'number' && value > 0;

  if (!hasCapacity) {
    return null;
  }

  return {
    emphasis: String(value),
    icon: 'parking',
    kind: 'spaces',
    label: translate(locale, 'spaces'),
    tone: getCapacityTone(value),
    value: translate(locale, 'spaces'),
  };
}

function formatStandType(
  value: string | number | boolean | null | undefined,
  locale: AppLocale,
): ParkingPopupDetail | null {
  const type = normalizeText(value);

  if (!type) {
    return null;
  }

  if (['stands', 'wide_stands', 'staple', 'hoop', 'post_hoop'].includes(type)) {
    return {
      icon: 'stand',
      kind: 'type',
      label: translate(locale, 'type'),
      tone: 'teal',
      value: formatTypeLabel(type, locale),
    };
  }

  if (['rack', 'racks'].includes(type)) {
    return {
      icon: 'parking',
      kind: 'type',
      label: translate(locale, 'type'),
      tone: 'teal',
      value: formatTypeLabel(type, locale),
    };
  }

  if (['shed', 'building', 'lockers', 'streetpod'].includes(type)) {
    return {
      icon: type === 'building' ? 'building' : 'storage',
      kind: 'type',
      label: translate(locale, 'type'),
      tone: 'green',
      value: formatTypeLabel(type, locale),
    };
  }

  if (
    [
      'wall_loops',
      'anchors',
      'ground_slots',
      'front_wheel',
      'vertical_stand',
    ].includes(type)
  ) {
    return {
      icon: 'fixture',
      kind: 'type',
      label: translate(locale, 'type'),
      tone: 'amber',
      value: formatTypeLabel(type, locale),
    };
  }

  return {
    icon: 'unknown',
    kind: 'type',
    label: translate(locale, 'type'),
    tone: 'neutral',
    value: formatTypeLabel(type, locale),
  };
}

const translatedTypeKeys = {
  anchors: 'typeAnchors',
  building: 'typeBuilding',
  customers: 'accessCustomers',
  destination: 'accessDestination',
  employees: 'accessEmployees',
  front_wheel: 'typeFrontWheel',
  ground_slots: 'typeGroundSlots',
  hoop: 'typeHoop',
  lockers: 'typeLockers',
  permissive: 'accessPermissive',
  permit: 'accessPermit',
  post_hoop: 'typePostHoop',
  private: 'accessPrivate',
  rack: 'typeRack',
  racks: 'typeRacks',
  residents: 'accessResidents',
  shed: 'typeShed',
  stands: 'typeStands',
  staple: 'typeStaple',
  streetpod: 'typeStreetpod',
  university: 'accessUniversity',
  vertical_stand: 'typeVerticalStand',
  wall_loops: 'typeWallLoops',
  wide_stands: 'typeWideStands',
} as const;

function formatTypeLabel(value: string, locale: AppLocale) {
  const messageKey =
    translatedTypeKeys[value as keyof typeof translatedTypeKeys];
  if (messageKey) {
    return translate(locale, messageKey);
  }

  return value
    .replaceAll(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCoverDetail(
  value: string | number | boolean | null | undefined,
  locale: AppLocale,
): ParkingPopupDetail | null {
  if (value === 'yes') {
    return {
      icon: 'covered',
      kind: 'cover',
      label: translate(locale, 'cover'),
      tone: 'green',
      value: translate(locale, 'covered'),
    };
  }

  if (value === 'no') {
    return {
      icon: 'not-covered',
      kind: 'cover',
      label: translate(locale, 'cover'),
      tone: 'muted',
      value: translate(locale, 'notCovered'),
    };
  }

  return null;
}

function formatAccessDetail(
  value: string | number | boolean | null | undefined,
  locale: AppLocale,
): ParkingPopupDetail | null {
  const access = normalizeText(value);

  if (!access) {
    return null;
  }

  if (access === 'unknown') {
    return null;
  }

  if (['yes', 'permissive', 'destination'].includes(access)) {
    return {
      icon: 'access-open',
      kind: 'access',
      label: translate(locale, 'access'),
      tone: 'green',
      value:
        access === 'yes'
          ? translate(locale, 'accessPublic')
          : formatTypeLabel(access, locale),
    };
  }

  if (['private', 'employees', 'permit', 'residents'].includes(access)) {
    return {
      icon: 'restricted',
      kind: 'access',
      label: translate(locale, 'access'),
      tone: 'restricted',
      value: formatTypeLabel(access, locale),
    };
  }

  if (access === 'customers') {
    return {
      icon: 'customer',
      kind: 'access',
      label: translate(locale, 'access'),
      tone: 'amber',
      value: translate(locale, 'accessCustomers'),
    };
  }

  if (access === 'university') {
    return {
      icon: 'university',
      kind: 'access',
      label: translate(locale, 'access'),
      tone: 'teal',
      value: translate(locale, 'accessUniversity'),
    };
  }

  return {
    icon: 'unknown',
    kind: 'access',
    label: translate(locale, 'access'),
    tone: 'neutral',
    value: formatTypeLabel(access, locale),
  };
}

export function getParkingDetails(
  point: ParkingPoint,
  locale: AppLocale = 'en',
): ParkingDetail[] {
  return [
    {
      kind: 'distance',
      label: translate(locale, 'distance'),
      value:
        typeof point.distanceMeters === 'number'
          ? translate(locale, 'away', {
              distance: formatDistance(point.distanceMeters, locale),
            })
          : translate(locale, 'notListed'),
    },
    {
      kind: 'spaces',
      label: translate(locale, 'spaces'),
      value: formatCapacity(point.properties.capacity, locale),
    },
    {
      kind: 'type',
      label: translate(locale, 'type'),
      value:
        normalizeText(point.properties.bicycle_pa) ??
        translate(locale, 'notListed'),
    },
    {
      kind: 'cover',
      label: translate(locale, 'cover'),
      value: formatCovered(point.properties.covered, locale),
    },
    {
      kind: 'access',
      label: translate(locale, 'access'),
      value:
        normalizeText(point.properties.access) ??
        translate(locale, 'notListed'),
    },
  ];
}

export function getParkingPopupDetails(
  point: ParkingPoint,
  locale: AppLocale = 'en',
): ParkingPopupDetails {
  return {
    metrics: [
      {
        icon: 'distance',
        kind: 'distance',
        label: translate(locale, 'distance'),
        tone: getDistanceTone(point.distanceMeters),
        value:
          typeof point.distanceMeters === 'number'
            ? translate(locale, 'away', {
                distance: formatDistance(point.distanceMeters, locale),
              })
            : translate(locale, 'notListed'),
      },
    ],
    details: [
      formatCapacityDetail(point.properties.capacity, locale),
      formatStandType(point.properties.bicycle_pa, locale),
      formatCoverDetail(point.properties.covered, locale),
      formatAccessDetail(point.properties.access, locale),
    ].filter((detail): detail is ParkingPopupDetail => detail !== null),
  };
}

const essentialParkingDetailKinds = new Set(['cover', 'spaces', 'type']);

export function getParkingEssentialDetails(
  point: ParkingPoint,
  locale: AppLocale = 'en',
): ParkingPopupDetail[] {
  return getParkingPopupDetails(point, locale).details.filter((detail) =>
    essentialParkingDetailKinds.has(detail.kind),
  );
}

const genericDirectionsParkingTypes = new Set(['rack', 'racks', 'stands']);

export function getDirectionsParkingDetails(
  point: ParkingPoint,
  locale: AppLocale = 'en',
): ParkingPopupDetail[] {
  const details = getParkingPopupDetails(point, locale).details;
  const capacity = details.find((detail) => detail.kind === 'spaces');
  const covered = details.find(
    (detail) => detail.kind === 'cover' && detail.icon === 'covered',
  );
  const type = details.find((detail) => detail.kind === 'type');
  const rawType = normalizeText(point.properties.bicycle_pa);
  const distinctiveType =
    rawType && !genericDirectionsParkingTypes.has(rawType) ? type : undefined;

  return [capacity, covered ?? distinctiveType].filter(
    (detail): detail is ParkingPopupDetail => detail !== undefined,
  );
}

export function describeParkingPoint(
  point: ParkingPoint,
  locale: AppLocale = 'en',
) {
  const capacity = formatCapacity(point.properties.capacity, locale);
  const kind =
    normalizeText(point.properties.bicycle_pa) ??
    translate(locale, 'typeNotListed');
  const covered = formatCovered(point.properties.covered, locale);
  const details = [capacity, kind];

  if (covered !== translate(locale, 'notListed')) {
    details.push(covered.toLowerCase());
  }

  return details.join(', ');
}
