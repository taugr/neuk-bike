/** Display preferences only. Stored distances and wind vectors remain SI. */
export type UnitSystem = 'metric' | 'imperial';
export const unitsStorageKey = 'cycle-parking-units';
export const METRES_PER_MILE = 1609.344;
export const METRES_PER_FOOT = 0.3048;
export function resolveUnits(value: unknown): UnitSystem {
  return value === 'imperial' ? 'imperial' : 'metric';
}
