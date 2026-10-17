import { describe, expect, it } from 'vitest';
import { resolveUnits, METRES_PER_MILE } from './units';
import { formatLocalizedDistance } from './i18n/format';
import { formatWindSpeed } from './wind';
import { getParkingPopupDetails } from './parking';
import { describeCycleRouteInstruction } from './cyclestreets';

describe('display units', () => {
  it('defaults unknown or absent saved preferences to metric', () => {
    for (const value of [null, undefined, '', 'mph', 'METRIC', {}])
      expect(resolveUnits(value)).toBe('metric');
    expect(resolveUnits('imperial')).toBe('imperial');
  });
  it('converts SI wind speeds with one decimal without changing the input', () => {
    expect(formatWindSpeed(4.4)).toBe('15.8 km/h');
    expect(formatWindSpeed(4.4, 'imperial')).toBe('9.8 mph');
    expect(formatWindSpeed(METRES_PER_MILE / 3600, 'imperial')).toBe('1.0 mph');
    expect(formatWindSpeed(0, 'imperial')).toBe('0.0 mph');
    expect(formatWindSpeed(4.456)).toBe('16.0 km/h');
    expect(formatWindSpeed(4.4, 'metric', 'es')).toBe('15,8 km/h');
  });
  it('uses feet below a tenth of a mile and miles above it', () => {
    expect(formatLocalizedDistance(30.48, 'en', 'imperial')).toBe('100 ft');
    expect(formatLocalizedDistance(160, 'en', 'imperial')).toBe('525 ft');
    expect(
      formatLocalizedDistance(METRES_PER_MILE / 10, 'en', 'imperial'),
    ).toBe('0.1 mi');
    expect(formatLocalizedDistance(METRES_PER_MILE, 'en', 'imperial')).toBe(
      '1.0 mi',
    );
    expect(formatLocalizedDistance(1250, 'en', 'imperial')).toBe('0.8 mi');
  });
  it('rounds metric distances at the kilometre boundary and handles missing values', () => {
    expect(formatLocalizedDistance(42.4, 'en')).toBe('42 m');
    expect(formatLocalizedDistance(999.5, 'en')).toBe('1.0 km');
    expect(formatLocalizedDistance(1250, 'hy')).toBe('1,3 կմ');
    expect(formatLocalizedDistance(undefined, 'en', 'imperial')).toBe(
      formatLocalizedDistance(NaN, 'en'),
    );
    expect(formatLocalizedDistance(0, 'en', 'imperial')).toBe('0 ft');
  });
  it('uses the same preference in parking descriptions and spoken straight instructions', () => {
    const point = {
      id: 'test',
      name: 'Parking',
      latitude: 55.95,
      longitude: -3.2,
      sourceId: 'test',
      properties: {},
      distanceMeters: 30.48,
    };
    expect(
      getParkingPopupDetails(point, 'en', 'imperial').metrics[0].value,
    ).toBe('100 ft away');
    expect(point.distanceMeters).toBe(30.48);
    const instruction = {
      id: 'test',
      streetName: '',
      turn: 'straight',
      anchor: [55.95, -3.2] as [number, number],
      distanceMeters: 30.48,
      durationSeconds: 10,
      travelMode: 'cycling' as const,
    };
    expect(
      describeCycleRouteInstruction(instruction, 'en', 'imperial'),
    ).toContain('100 ft');
  });
});
