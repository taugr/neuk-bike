import type { ParkingPoint } from '@/lib/types';

const parkingDisplayNames: Readonly<Record<string, string>> = {
  'cec:43': 'Waterloo Place',
  'cec:178': 'Princes Street by Waverley Steps',
  'cec:1320': 'Leith Street by The Newsroom',
};

export function getParkingDisplayName(point: ParkingPoint) {
  return parkingDisplayNames[point.id] ?? point.name;
}
