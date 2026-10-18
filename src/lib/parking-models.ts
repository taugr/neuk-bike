import { isCyclingPoiPoint, type ParkingPoint } from '@/lib/types';
import { distanceMeters } from '@/lib/geo';

export const parkingModelsZoom = 18;
export const parkingModelScale = 3.4;
export { createParkingMesh } from './parking-model-mesh';
export type { ParkingMesh, Vec3 } from './parking-model-mesh';
export type { ModelKind } from './parking-model-catalog';
import {
  resolveParkingModelType,
  parkingModelHasCover,
  type ModelKind,
} from './parking-model-catalog';
export function parkingModelKind(point: ParkingPoint): ModelKind | null {
  return isCyclingPoiPoint(point)
    ? null
    : resolveParkingModelType(point.properties.bicycle_pa);
}

export type ParkingModel = {
  point: ParkingPoint;
  members: ParkingPoint[];
  longitude: number;
  latitude: number;
  kind: ModelKind;
  covered: boolean;
  selected: boolean;
};
export function buildParkingModels(
  points: ParkingPoint[],
  selectedId?: string,
): ParkingModel[] {
  const models: ParkingModel[] = [];
  // Stable, bounded groups: never chain nearby sites into one long cluster.
  for (const point of [...points].sort((a, b) => a.id.localeCompare(b.id))) {
    const kind = parkingModelKind(point);
    if (!kind) continue;
    const covered = parkingModelHasCover(
      point.properties.bicycle_pa,
      point.properties.covered,
    );
    const group = models.find(
      (model) =>
        model.kind === kind &&
        model.covered === covered &&
        model.members.every((member) => distanceMeters(member, point) <= 18),
    );
    if (group) group.members.push(point);
    else
      models.push({
        point,
        members: [point],
        longitude: point.longitude,
        latitude: point.latitude,
        kind,
        covered,
        selected: false,
      });
  }
  for (const model of models) {
    const selected = model.members.find((point) => point.id === selectedId);
    model.selected = Boolean(selected);
    model.point = selected ?? model.members[0];
    model.longitude =
      model.members.reduce((sum, point) => sum + point.longitude, 0) /
      model.members.length;
    model.latitude =
      model.members.reduce((sum, point) => sum + point.latitude, 0) /
      model.members.length;
  }
  return models;
}

/** Screen-space rows keep every 44px button reachable, regardless of bearing. */
export function parkingModelButtonOffset(
  index: number,
  count: number,
): [number, number] {
  const columns = Math.min(count, 4);
  const row = Math.floor(index / columns);
  const rowCount = Math.min(columns, count - row * columns);
  return [((index % columns) - (rowCount - 1) / 2) * 46, 26 + row * 46];
}
