/** Display-only placement. Parking records and route coordinates never change. */
export type ModelBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};
export type ModelOffset = { east: number; north: number };
export type ModelPlacement = {
  id: string;
  offset: ModelOffset;
  members: string[];
};
export const modelPlacementLimit = 8;
export const modelPlacementGap = 6;
const zero: ModelOffset = { east: 0, north: 0 };

export function boundsOverlap(
  a: ModelBounds,
  b: ModelBounds,
  gap = modelPlacementGap,
) {
  return (
    a.left < b.right + gap &&
    a.right + gap > b.left &&
    a.top < b.bottom + gap &&
    a.bottom + gap > b.top
  );
}

/** Small screen-space grid avoids comparing every model with every other one. */
class BoundsIndex {
  private cells = new Map<string, Set<string>>();
  private bounds = new Map<string, ModelBounds>();
  private keys(bounds: ModelBounds) {
    const keys: string[] = [];
    for (
      let x = Math.floor((bounds.left - modelPlacementGap) / 128);
      x <= Math.floor((bounds.right + modelPlacementGap) / 128);
      x++
    )
      for (
        let y = Math.floor((bounds.top - modelPlacementGap) / 128);
        y <= Math.floor((bounds.bottom + modelPlacementGap) / 128);
        y++
      )
        keys.push(`${x}:${y}`);
    return keys;
  }
  remove(id: string) {
    const bounds = this.bounds.get(id);
    if (!bounds) return;
    for (const key of this.keys(bounds)) this.cells.get(key)?.delete(id);
    this.bounds.delete(id);
  }
  add(id: string, bounds: ModelBounds) {
    this.remove(id);
    this.bounds.set(id, bounds);
    for (const key of this.keys(bounds)) {
      if (!this.cells.has(key)) this.cells.set(key, new Set());
      this.cells.get(key)!.add(id);
    }
  }
  collisions(bounds: ModelBounds, except?: string) {
    const ids = new Set(
      this.keys(bounds).flatMap((key) => [...(this.cells.get(key) ?? [])]),
    );
    return [...ids].filter(
      (id) => id !== except && boundsOverlap(bounds, this.bounds.get(id)!),
    );
  }
}

const candidates = [
  zero,
  ...[2, 4, 6, 8].flatMap((radius) =>
    Array.from({ length: 16 }, (_, i) => ({
      east: radius * Math.cos((i * Math.PI) / 8),
      north: radius * Math.sin((i * Math.PI) / 8),
    })),
  ),
];

/** Called once after a camera gesture, never from the moving-frame solver path.
 * Reserve real positions first so moving one symbol cannot displace an isolated neighbour.
 * Failed placements collapse only their actual collision component, with all IDs retained.
 */
export function placeParkingModels({
  ids,
  project,
  previous = new Map(),
}: {
  ids: string[];
  project: (id: string, offset: ModelOffset) => ModelBounds;
  previous?: ReadonlyMap<string, ModelOffset>;
}): ModelPlacement[] {
  const ordered = [...ids].sort();
  const originals = new BoundsIndex();
  const occupied = new BoundsIndex();
  const result = new Map<string, ModelPlacement>();
  const parents = new Map(ordered.map((id) => [id, id]));
  const root = (id: string): string => {
    const parent = parents.get(id)!;
    if (parent === id) return id;
    const value = root(parent);
    parents.set(id, value);
    return value;
  };
  const join = (a: string, b: string) => {
    const roots = [root(a), root(b)].sort();
    parents.set(roots[1], roots[0]);
  };
  for (const id of ordered) originals.add(id, project(id, zero));
  for (const id of ordered) {
    if (result.has(id)) continue;
    const original = project(id, zero);
    const neighbours = originals.collisions(original, id);
    const retained = previous.get(id);
    const options =
      neighbours.length &&
      retained &&
      Math.hypot(retained.east, retained.north) <= modelPlacementLimit + 1e-8
        ? [retained, ...candidates]
        : candidates;
    let chosen: ModelOffset | undefined;
    for (const offset of options) {
      const bounds = project(id, offset);
      if (occupied.collisions(bounds).length) continue;
      // Do not move onto a still-unprocessed site's real position.
      if (
        originals
          .collisions(bounds, id)
          .some((other) => !result.has(other) && !neighbours.includes(other))
      )
        continue;
      chosen = offset;
      break;
    }
    // Solve small collision components together: a greedy first placement can
    // leave no room for the final roof even though a bounded arrangement exists.
    if (!chosen && neighbours.length <= 4) {
      const component = new Set([id]);
      for (const member of component) {
        for (const other of originals.collisions(project(member, zero), member))
          component.add(other);
        if (component.size > 5) break;
      }
      if (component.size <= 5) {
        const before = [...component]
          .filter((member) => member !== id && result.has(member))
          .map((member) => result.get(member)!);
        // Previously unresolved groups must stay grouped until the next solve.
        const independent = before.every((p) => root(p.id) === p.id);
        if (independent) {
          for (const member of component) occupied.remove(member);
          const options = new Map(
            [...component].map((member) => [
              member,
              [...candidates].reverse().filter((offset) => {
                const box = project(member, offset);
                return (
                  !occupied.collisions(box).length &&
                  !originals
                    .collisions(box, member)
                    .some(
                      (other) => !component.has(other) && !result.has(other),
                    )
                );
              }),
            ]),
          );
          let checks = 0;
          const trial = new Map<string, ModelOffset>();
          const search = (remaining: string[]): boolean => {
            if (!remaining.length) return true;
            if (checks > 12000) return false;
            // The most constrained site first substantially limits backtracking.
            const available = remaining
              .map((member) => ({
                member,
                offsets: options.get(member)!.filter((offset) => {
                  checks++;
                  return !occupied.collisions(project(member, offset)).length;
                }),
              }))
              .sort((a, b) => a.offsets.length - b.offsets.length);
            const next = available[0];
            for (const offset of next.offsets) {
              if (checks > 12000) break;
              occupied.add(next.member, project(next.member, offset));
              trial.set(next.member, offset);
              if (search(remaining.filter((member) => member !== next.member)))
                return true;
              occupied.remove(next.member);
              trial.delete(next.member);
            }
            return false;
          };
          if (search([...component].sort())) {
            chosen = trial.get(id)!;
            for (const member of component)
              result.set(member, {
                id: member,
                members: [member],
                offset: trial.get(member)!,
              });
          } else {
            for (const member of component) occupied.remove(member);
            for (const placement of before)
              occupied.add(
                placement.id,
                project(placement.id, placement.offset),
              );
          }
        }
      }
    }
    const offset = chosen ?? zero;
    result.set(id, { id, offset, members: [id] });
    occupied.add(id, project(id, offset));
    if (!chosen) {
      for (const other of occupied.collisions(original, id)) join(id, other);
      for (const other of neighbours) join(id, other);
    }
  }
  // A fallback returns its members to their true anchors. Include any symbols
  // those anchors overlap so unresolved geometry is never silently stacked.
  let changed = true;
  while (changed) {
    changed = false;
    const counts = new Map<string, number>();
    for (const id of ordered)
      counts.set(root(id), (counts.get(root(id)) ?? 0) + 1);
    for (const id of ordered) {
      if (counts.get(root(id)) === 1) continue;
      for (const other of occupied.collisions(project(id, zero))) {
        if (root(id) !== root(other)) {
          join(id, other);
          changed = true;
        }
      }
    }
  }
  const groups = new Map<string, string[]>();
  for (const id of ordered) {
    const key = root(id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(id);
  }
  return [...groups].map(([id, members]) =>
    members.length === 1 ? result.get(id)! : { id, members, offset: zero },
  );
}

export function offsetModelLocation(
  longitude: number,
  latitude: number,
  offset: ModelOffset,
) {
  const metresPerDegree = (Math.PI * 6371000) / 180;
  return {
    longitude:
      longitude +
      offset.east / (metresPerDegree * Math.cos((latitude * Math.PI) / 180)),
    latitude: latitude + offset.north / metresPerDegree,
  };
}

/** Keep 44px controls clear of both other controls and the illustrations. */
export function placeModelButtons(
  buttons: {
    id: string;
    ground: { x: number; y: number };
    preferred: [number, number];
  }[],
  obstacles: ModelBounds[],
  area: ModelBounds,
): Map<string, [number, number]> {
  const result = new Map<string, [number, number]>();
  const occupied: ModelBounds[] = [];
  for (const button of [...buttons].sort((a, b) => a.id.localeCompare(b.id))) {
    const { ground, preferred } = button;
    const box = ([x, y]: [number, number]) => ({
      left: ground.x + x - 22,
      right: ground.x + x + 22,
      top: ground.y + y - 22,
      bottom: ground.y + y + 22,
    });
    const inArea = (bounds: ModelBounds) =>
      bounds.left >= area.left + 4 &&
      bounds.right <= area.right - 4 &&
      bounds.top >= area.top + 4 &&
      bounds.bottom <= area.bottom - 4;
    // Do not pull offscreen sites into view as phantom buttons along the edge.
    if (
      ground.x < area.left ||
      ground.x > area.right ||
      ground.y < area.top ||
      ground.y > area.bottom
    ) {
      result.set(button.id, preferred);
      continue;
    }
    const options: [number, number][] = [];
    for (let row = -8; row <= 8; row++)
      for (let column = -8; column <= 8; column++)
        options.push([preferred[0] + column * 46, preferred[1] + row * 46]);
    options.sort(
      (a, b) =>
        Math.hypot(a[0] - preferred[0], a[1] - preferred[1]) -
        Math.hypot(b[0] - preferred[0], b[1] - preferred[1]),
    );
    const available = (offset: [number, number], avoidModels: boolean) => {
      const bounds = box(offset);
      return (
        inArea(bounds) &&
        !occupied.some((other) => boundsOverlap(bounds, other, 2)) &&
        (!avoidModels ||
          !obstacles.some((other) => boundsOverlap(bounds, other, 2)))
      );
    };
    const offset =
      options.find((o) => available(o, true)) ??
      options.find((o) => available(o, false)) ??
      preferred;
    occupied.push(box(offset));
    result.set(button.id, offset);
  }
  return result;
}
