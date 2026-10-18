export type ScreenPin = {
  id: string;
  x: number;
  y: number;
  protected: boolean;
};
export type ScreenArea = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

// A stable, spatially mixed priority avoids favouring one corner or list order.
function priority(id: string) {
  let value = 2166136261;
  for (let i = 0; i < id.length; i++)
    value = Math.imul(value ^ id.charCodeAt(i), 16777619);
  return value >>> 0;
}

export function selectScreenPins({
  pins,
  area,
  zoom,
  pitch,
  previous,
}: {
  pins: ScreenPin[];
  area: ScreenArea;
  zoom: number;
  pitch: number;
  previous: ReadonlySet<string>;
}): Set<string> {
  const buffer = 64;
  const inFrame = (pin: ScreenPin) =>
    Number.isFinite(pin.x) &&
    Number.isFinite(pin.y) &&
    pin.x >= area.left - buffer &&
    pin.x <= area.right + buffer &&
    pin.y >= area.top - buffer &&
    pin.y <= area.bottom + buffer;
  const baseSpacing = Math.max(30, Math.min(52, 48 - (zoom - 13) * 3.6));
  const spacing = (pin: ScreenPin) => {
    const depth = Math.max(
      0,
      Math.min(1, (pin.y - area.top) / Math.max(1, area.bottom - area.top)),
    );
    return baseSpacing * (1 + (Math.min(60, pitch) / 60) * (1 - depth) * 0.8);
  };
  const selected = new Set(
    pins.filter((pin) => pin.protected).map((pin) => pin.id),
  );
  const occupied = pins.filter((pin) => pin.protected && inFrame(pin));
  const candidates = pins
    .filter((pin) => !pin.protected && inFrame(pin))
    .sort(
      (a, b) =>
        Number(previous.has(b.id)) - Number(previous.has(a.id)) ||
        priority(a.id) - priority(b.id) ||
        a.id.localeCompare(b.id),
    );
  for (const pin of candidates) {
    // Keep existing pins through small camera changes; new pins need more room.
    const retention = previous.has(pin.id) ? 0.82 : 1;
    if (
      occupied.some(
        (other) =>
          Math.hypot(pin.x - other.x, pin.y - other.y) <
          Math.max(spacing(pin), spacing(other)) * retention,
      )
    )
      continue;
    selected.add(pin.id);
    occupied.push(pin);
  }
  return selected;
}
