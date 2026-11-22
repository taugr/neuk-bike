export type HistoricDistrict = 'old-town' | 'new-town';

export type HistoricWall = {
  district: HistoricDistrict;
  levels?: number;
  street: boolean;
  entrances: number[];
  shops: number[];
};

function positions(value: unknown) {
  return Array.isArray(value)
    ? value.filter((t): t is number => typeof t === 'number' && t > 0 && t < 1)
    : [];
}

export function historicFacadeFaces(
  value: unknown,
):
  | { district: HistoricDistrict; layouts: Map<number, HistoricWall> }
  | undefined {
  if (!value || typeof value !== 'object') return;
  const { district, levels, faces } = value as Record<string, unknown>;
  if (
    (district !== 'old-town' && district !== 'new-town') ||
    !Array.isArray(faces)
  )
    return;
  const layouts = new Map<number, HistoricWall>();
  for (const face of faces) {
    if (!Array.isArray(face)) continue;
    const [index, side, entrances, shops] = face;
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      (side !== 'front' && side !== 'rear')
    )
      continue;
    layouts.set(index, {
      district,
      levels:
        typeof levels === 'number' && levels > 0
          ? Math.round(levels)
          : undefined,
      street: side === 'front',
      entrances: side === 'front' ? positions(entrances) : [],
      shops: side === 'front' ? positions(shops) : [],
    });
  }
  if (layouts.size) return { district, layouts };
}
