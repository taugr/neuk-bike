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
  sourceId: string;
  distanceMeters?: number;
};

export type ParkingDataSource = {
  attribution: string;
  id: string;
  label: string;
  licenceName: string;
  licenceUrl: string;
  recordCount: number;
  sourceTimestamp?: string | null;
  sourceUrl: string;
};

export type ParkingCoverageArea = {
  bounds: { east: number; north: number; south: number; west: number };
  id: string;
  label: string;
  rings: {
    coordinates: [number, number][];
    exclude: boolean;
  }[];
};

export type ParkingDataManifest = {
  chunkZoom: number;
  chunks: Record<
    string,
    {
      bounds: { east: number; north: number; south: number; west: number };
      count: number;
      path: string;
    }
  >;
  coverage: {
    areas: ParkingCoverageArea[];
    label: string;
  };
  pointIndexPath: string;
  recordCount: number;
  refreshedAt: string;
  schemaVersion: number;
  sources: ParkingDataSource[];
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
