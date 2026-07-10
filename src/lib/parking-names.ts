import type { ParkingPoint } from '@/lib/types';

const parkingDisplayNames: Readonly<Record<string, string>> = {
  '43': 'Waterloo Place',
  '178': 'Princes Street by Waverley Steps',
  '1320': 'Leith Street by The Newsroom',
};

export function getParkingDisplayName(point: ParkingPoint) {
  return parkingDisplayNames[point.id] ?? point.name;
}
