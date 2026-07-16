type Coordinate = {
  latitude: number;
  longitude: number;
};

type GeneratedParkingPoint = Coordinate & {
  id: string;
  name: string;
  properties: Record<string, string | number>;
  sourceId: string;
};

export const PARKING_SCHEMA_VERSION: number;
export const PARKING_CHUNK_ZOOM: number;

export function distanceMeters(from: Coordinate, to: Coordinate): number;
export function toTileCoordinate(
  latitude: number,
  longitude: number,
  zoom: number,
): { x: number; y: number };
export function getTileKey(point: Coordinate, zoom?: number): string;
export function getTileBounds(key: string): {
  east: number;
  north: number;
  south: number;
  west: number;
};
export function shouldMergeCouncilAndOsm(
  councilPoint: GeneratedParkingPoint,
  osmPoint: GeneratedParkingPoint,
): boolean;
export function mergeParkingSources(
  councilPoints: GeneratedParkingPoint[],
  osmPoints: GeneratedParkingPoint[],
): {
  matches: Array<{
    councilId: string;
    distanceMeters: number;
    osmId: string;
  }>;
  points: GeneratedParkingPoint[];
  suppressedOsmIds: Set<string>;
};
export function deduplicateParkingPoints(points: GeneratedParkingPoint[]): {
  duplicateIds: string[];
  points: GeneratedParkingPoint[];
};
export function parseGeofabrikPoly(
  content: string,
  id: string,
  label: string,
): {
  bounds: { east: number; north: number; south: number; west: number };
  id: string;
  label: string;
  rings: Array<{
    coordinates: [number, number][];
    exclude: boolean;
  }>;
};
export function representativePoint(
  coordinates: Array<Coordinate | null | undefined>,
): Coordinate | null;
export function normalizeOsmProperties(
  tags: Record<string, string | undefined>,
): Record<string, string | number>;
export function isGenericParkingName(name: unknown): boolean;
type NamingContextEntry = Coordinate & { name: string };
type NamingJunction = Coordinate & { names: string[] };
export function deriveParkingNames(
  points: GeneratedParkingPoint[],
  context: {
    roads?: NamingContextEntry[];
    junctions?: NamingJunction[];
    landmarks?: NamingContextEntry[];
    places?: NamingContextEntry[];
  },
): {
  counts: Record<string, number>;
  points: GeneratedParkingPoint[];
};
