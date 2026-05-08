export type UserLocation = {
  latitude: number;
  longitude: number;
};

export type ParkingPoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  properties: Record<string, string | number | boolean | null>;
  distanceMeters?: number;
};

export type CycleParkingDataset = {
  metadata: {
    sourceUrl: string;
    licenceUrl: string;
    attribution: string;
    refreshedAt: string;
    recordCount: number;
  };
  points: ParkingPoint[];
};
