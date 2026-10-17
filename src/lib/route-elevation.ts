/** Sum uphill steps, not endpoint height change. Incomplete profiles stay unknown. */
export function calculateRouteAscent(
  streets: { lengthMetres?: unknown; elevationsMetres?: unknown }[],
): number | undefined {
  if (!streets.length) return undefined;
  let ascent = 0;
  let hasProfile = false;
  for (const street of streets) {
    if (street.lengthMetres === 0) continue;
    const elevations = street.elevationsMetres;
    if (
      !Array.isArray(elevations) ||
      elevations.length < 2 ||
      !elevations.every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      )
    )
      return undefined;
    hasProfile = true;
    // Each street owns its profile; do not count discontinuities between streets.
    for (let index = 1; index < elevations.length; index++) {
      ascent += Math.max(0, elevations[index] - elevations[index - 1]);
    }
  }
  return hasProfile ? ascent : undefined;
}
