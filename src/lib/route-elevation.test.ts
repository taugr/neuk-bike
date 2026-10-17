import { describe, expect, it } from 'vitest';
import { calculateRouteAscent } from './route-elevation';
import { formatLocalizedElevation } from './i18n/format';
describe('route climbing', () => {
  it('adds every uphill step without counting downhill or inter-street jumps', () => {
    expect(
      calculateRouteAscent([
        { elevationsMetres: [10, 14.5, 9, 12] },
        { elevationsMetres: [80, 82, 70] },
      ]),
    ).toBe(9.5);
  });
  it('distinguishes flat or downhill from missing elevation', () => {
    expect(calculateRouteAscent([{ elevationsMetres: [10, 10, 2] }])).toBe(0);
    expect(calculateRouteAscent([])).toBeUndefined();
    expect(calculateRouteAscent([{ lengthMetres: 0 }])).toBeUndefined();
    expect(
      calculateRouteAscent([{ lengthMetres: 0 }, { elevationsMetres: [1, 4] }]),
    ).toBe(3);
  });
  it.each([undefined, [], [1], [1, null], [1, '2'], [1, NaN], [1, Infinity]])(
    'does not report a partial total for incomplete profiles %j',
    (elevationsMetres) => {
      expect(
        calculateRouteAscent([
          { elevationsMetres: [1, 8] },
          { elevationsMetres },
        ]),
      ).toBeUndefined();
    },
  );
  it('uses whole metres or feet even for large climbs', () => {
    expect(formatLocalizedElevation(24.4, 'en', 'metric')).toBe('24 m');
    expect(formatLocalizedElevation(24, 'en', 'imperial')).toBe('79 ft');
    expect(formatLocalizedElevation(1500, 'en', 'metric')).toBe('1,500 m');
    expect(formatLocalizedElevation(1500, 'en', 'imperial')).toBe('4,921 ft');
  });
});
