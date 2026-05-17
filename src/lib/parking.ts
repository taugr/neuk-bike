import { formatDistance } from '@/lib/geo';
import type { ParkingPoint } from '@/lib/types';

type ParkingDetail = {
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
  label: string;
  tone: ParkingPopupTone;
  value: string;
};

type ParkingPopupDetail = {
  emphasis?: string;
  icon: ParkingPopupIcon;
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

function formatCapacity(value: string | number | boolean | null | undefined) {
  return typeof value === 'number' && value > 0
    ? `${value} spaces`
    : 'Not listed';
}

function formatCovered(value: string | number | boolean | null | undefined) {
  if (value === 'yes') {
    return 'Covered';
  }

  if (value === 'no') {
    return 'Not covered';
  }

  return 'Not listed';
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
): ParkingPopupDetail | null {
  const hasCapacity = typeof value === 'number' && value > 0;

  if (!hasCapacity) {
    return null;
  }

  return {
    emphasis: String(value),
    icon: 'parking',
    label: 'Spaces',
    tone: getCapacityTone(value),
    value: 'Spaces',
  };
}

function formatStandType(
  value: string | number | boolean | null | undefined,
): ParkingPopupDetail | null {
  const type = normalizeText(value);

  if (!type) {
    return null;
  }

  if (['stands', 'wide_stands', 'staple', 'hoop', 'post_hoop'].includes(type)) {
    return {
      icon: 'stand',
      label: 'Type',
      tone: 'teal',
      value: formatTypeLabel(type),
    };
  }

  if (['rack', 'racks'].includes(type)) {
    return {
      icon: 'parking',
      label: 'Type',
      tone: 'teal',
      value: formatTypeLabel(type),
    };
  }

  if (['shed', 'building', 'lockers', 'streetpod'].includes(type)) {
    return {
      icon: type === 'building' ? 'building' : 'storage',
      label: 'Type',
      tone: 'green',
      value: formatTypeLabel(type),
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
      label: 'Type',
      tone: 'amber',
      value: formatTypeLabel(type),
    };
  }

  return {
    icon: 'unknown',
    label: 'Type',
    tone: 'neutral',
    value: formatTypeLabel(type),
  };
}

function formatTypeLabel(value: string) {
  return value
    .replaceAll(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCoverDetail(
  value: string | number | boolean | null | undefined,
): ParkingPopupDetail | null {
  if (value === 'yes') {
    return {
      icon: 'covered',
      label: 'Cover',
      tone: 'green',
      value: 'Covered',
    };
  }

  if (value === 'no') {
    return {
      icon: 'not-covered',
      label: 'Cover',
      tone: 'muted',
      value: 'Not covered',
    };
  }

  return null;
}

function formatAccessDetail(
  value: string | number | boolean | null | undefined,
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
      label: 'Access',
      tone: 'green',
      value: access === 'yes' ? 'Public access' : formatTypeLabel(access),
    };
  }

  if (['private', 'employees', 'permit', 'residents'].includes(access)) {
    return {
      icon: 'restricted',
      label: 'Access',
      tone: 'restricted',
      value: formatTypeLabel(access),
    };
  }

  if (access === 'customers') {
    return {
      icon: 'customer',
      label: 'Access',
      tone: 'amber',
      value: 'Customers',
    };
  }

  if (access === 'university') {
    return {
      icon: 'university',
      label: 'Access',
      tone: 'teal',
      value: 'University',
    };
  }

  return {
    icon: 'unknown',
    label: 'Access',
    tone: 'neutral',
    value: formatTypeLabel(access),
  };
}

export function getParkingDetails(point: ParkingPoint): ParkingDetail[] {
  return [
    {
      label: 'Distance',
      value:
        typeof point.distanceMeters === 'number'
          ? `${formatDistance(point.distanceMeters)} away`
          : 'Not listed',
    },
    {
      label: 'Spaces',
      value: formatCapacity(point.properties.capacity),
    },
    {
      label: 'Type',
      value: normalizeText(point.properties.bicycle_pa) ?? 'Not listed',
    },
    {
      label: 'Cover',
      value: formatCovered(point.properties.covered),
    },
    {
      label: 'Access',
      value: normalizeText(point.properties.access) ?? 'Not listed',
    },
  ];
}

export function getParkingPopupDetails(
  point: ParkingPoint,
): ParkingPopupDetails {
  return {
    metrics: [
      {
        icon: 'distance',
        label: 'Distance',
        tone: getDistanceTone(point.distanceMeters),
        value:
          typeof point.distanceMeters === 'number'
            ? `${formatDistance(point.distanceMeters)} away`
            : 'Not listed',
      },
    ],
    details: [
      formatCapacityDetail(point.properties.capacity),
      formatStandType(point.properties.bicycle_pa),
      formatCoverDetail(point.properties.covered),
      formatAccessDetail(point.properties.access),
    ].filter((detail): detail is ParkingPopupDetail => detail !== null),
  };
}

export function describeParkingPoint(point: ParkingPoint) {
  const capacity = formatCapacity(point.properties.capacity);
  const kind = normalizeText(point.properties.bicycle_pa) ?? 'type not listed';
  const covered = formatCovered(point.properties.covered);
  const details = [capacity, kind];

  if (covered !== 'Not listed') {
    details.push(covered.toLowerCase());
  }

  return details.join(', ');
}
