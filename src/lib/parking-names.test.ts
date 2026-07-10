import { describe, expect, it } from 'vitest';
import { getParkingDisplayName } from '@/lib/parking-names';
import type { ParkingPoint } from '@/lib/types';

function parkingPoint(id: string, name: string): ParkingPoint {
  return {
    id,
    name,
    latitude: 55.9533,
    longitude: -3.1883,
    properties: {
      OBJECTID: Number(id),
      CECLand: '',
      access: '',
      bicycle_pa: '',
      capacity: 0,
      covered: '',
      eastings: 0,
      fee: '',
      northings: 0,
      operator: '',
    },
  };
}

describe('getParkingDisplayName', () => {
  it('uses a human-readable name for a curated central location', () => {
    expect(
      getParkingDisplayName(parkingPoint('178', 'Cycle parking 178')),
    ).toBe('Princes Street by Waverley Steps');
  });

  it('keeps the source name when no curated name exists', () => {
    expect(
      getParkingDisplayName(parkingPoint('999', 'Cycle parking 999')),
    ).toBe('Cycle parking 999');
  });
});
