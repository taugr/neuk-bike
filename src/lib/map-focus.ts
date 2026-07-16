export type MapFocusTarget = {
  currentLocationFocusRequestId: number;
  route: unknown;
  selectedPointId: string | null;
  userLatitude: number;
  userLongitude: number;
};

export function hasMapFocusTargetChanged(
  previous: MapFocusTarget | null,
  next: MapFocusTarget,
) {
  return (
    previous === null ||
    previous.currentLocationFocusRequestId !==
      next.currentLocationFocusRequestId ||
    previous.route !== next.route ||
    previous.selectedPointId !== next.selectedPointId ||
    previous.userLatitude !== next.userLatitude ||
    previous.userLongitude !== next.userLongitude
  );
}

export function shouldApplyMapFocus({
  hasAppliedNearbyFocus,
  hasNearbyFocusPoints,
  next,
  previous,
}: {
  hasAppliedNearbyFocus: boolean;
  hasNearbyFocusPoints: boolean;
  next: MapFocusTarget;
  previous: MapFocusTarget | null;
}) {
  return (
    hasMapFocusTargetChanged(previous, next) ||
    (!hasAppliedNearbyFocus &&
      hasNearbyFocusPoints &&
      next.route === null &&
      next.selectedPointId === null)
  );
}
