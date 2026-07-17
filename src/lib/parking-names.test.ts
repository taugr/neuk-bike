import { describe, expect, it } from 'vitest';
import {
  formatParkingDisplayName,
  getParkingDisplayName,
} from '@/lib/parking-names';
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
    sourceId: 'cec',
  };
}

describe('getParkingDisplayName', () => {
  it('uses a human-readable name for a curated central location', () => {
    expect(
      getParkingDisplayName(parkingPoint('cec:178', 'Cycle parking 178')),
    ).toBe('Princes Street by Waverley Steps');
  });

  it('keeps the source name when no curated name exists', () => {
    expect(
      getParkingDisplayName(parkingPoint('cec:999', 'Cycle parking 999')),
    ).toBe('Cycle parking 999');
  });
});

describe('formatParkingDisplayName', () => {
  it('localizes generated connectors while preserving proper names', () => {
    const point = parkingPoint('osm:1', 'Calle de Alcalá near Gran Vía');
    point.properties.nameSource = 'junction';

    expect(formatParkingDisplayName(point, 'es')).toBe(
      'Calle de Alcalá cerca de Gran Vía',
    );
    expect(formatParkingDisplayName(point, 'gd')).toBe(
      'Calle de Alcalá faisg air Gran Vía',
    );
  });

  it('localizes generated suffixes and generic names', () => {
    const street = parkingPoint('osm:2', 'Sràid na Banrighinn cycle parking');
    street.properties.nameSource = 'street';
    expect(formatParkingDisplayName(street, 'gd')).toBe(
      'Pàirceadh bhaidhsagalan aig Sràid na Banrighinn',
    );

    const generic = parkingPoint('osm:3', 'Cycle parking 3');
    generic.properties.nameSource = 'generic';
    expect(formatParkingDisplayName(generic, 'es')).toBe('Aparcabicis');
  });

  it('never rewrites a source-authored or curated name', () => {
    const source = parkingPoint('osm:4', 'Aparcabicis Plaza Mayor');
    source.properties.nameSource = 'source';
    expect(formatParkingDisplayName(source, 'gd')).toBe(
      'Aparcabicis Plaza Mayor',
    );
    expect(
      formatParkingDisplayName(
        parkingPoint('cec:178', 'Cycle parking 178'),
        'es',
      ),
    ).toBe('Princes Street by Waverley Steps');
  });
});
