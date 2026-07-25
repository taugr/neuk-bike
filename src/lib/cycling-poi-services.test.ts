import { describe, expect, it } from 'vitest';
import { getCyclingPoiServices } from '@/lib/cycling-poi-services';
import type { CyclingPoiPoint } from '@/lib/types';

function cyclingPlace(
  overrides: Partial<CyclingPoiPoint> = {},
): CyclingPoiPoint {
  return {
    categories: ['shop'],
    id: 'osm:node:1',
    latitude: 55.9533,
    longitude: -3.1883,
    name: 'Cycle Scotland',
    properties: {},
    sourceId: 'osm',
    ...overrides,
  };
}

describe('getCyclingPoiServices', () => {
  it('presents repair, pump and tools in a stable order', () => {
    expect(
      getCyclingPoiServices(
        cyclingPlace({
          categories: ['shop', 'repair', 'hire'],
          properties: {
            servicePump: 'yes',
            serviceRental: 'yes',
            serviceRepair: 'yes',
            serviceTools: 'yes',
          },
        }),
      ),
    ).toEqual(['repair', 'pump', 'tools']);
  });

  it('does not present hire as a service', () => {
    expect(
      getCyclingPoiServices(
        cyclingPlace({
          categories: ['shop', 'hire'],
          properties: { serviceRental: 'yes' },
        }),
      ),
    ).toEqual([]);
  });

  it('only presents explicitly confirmed pump and tools services', () => {
    expect(
      getCyclingPoiServices(
        cyclingPlace({
          properties: {
            servicePump: 'no',
            serviceTools: 'unknown',
          },
        }),
      ),
    ).toEqual([]);
  });

  it('keeps repair stations identifiable without an explicit service tag', () => {
    expect(
      getCyclingPoiServices(
        cyclingPlace({
          categories: ['repair'],
          properties: { serviceRepair: 'no' },
        }),
      ),
    ).toEqual(['repair']);
  });
});
