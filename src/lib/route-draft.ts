import {
  CYCLESTREETS_DEFAULT_ROUTE_PLAN,
  CYCLESTREETS_MAX_WAYPOINTS,
  type CycleRoute,
  type CycleRoutePlan,
  type CycleRouteWaypoint,
} from '@/lib/cyclestreets';

export type RouteDraft = {
  id: string;
  name: string;
  plan: CycleRoutePlan;
  waypoints: CycleRouteWaypoint[];
};

export function createRouteDraft(
  id: string,
  start?: CycleRouteWaypoint,
): RouteDraft {
  return {
    id,
    name: '',
    plan: CYCLESTREETS_DEFAULT_ROUTE_PLAN,
    waypoints: start ? [start] : [],
  };
}

export function addRouteWaypoint(
  draft: RouteDraft,
  waypoint: CycleRouteWaypoint,
) {
  if (draft.waypoints.length >= CYCLESTREETS_MAX_WAYPOINTS) {
    return draft;
  }

  return { ...draft, waypoints: [...draft.waypoints, waypoint] };
}

export function updateRouteWaypoint(
  draft: RouteDraft,
  id: string,
  waypoint: CycleRouteWaypoint,
) {
  return {
    ...draft,
    waypoints: draft.waypoints.map((candidate) =>
      candidate.id === id ? waypoint : candidate,
    ),
  };
}

export function removeRouteWaypoint(draft: RouteDraft, id: string) {
  return {
    ...draft,
    waypoints: draft.waypoints.filter((waypoint) => waypoint.id !== id),
  };
}

export function moveRouteWaypoint(
  draft: RouteDraft,
  fromIndex: number,
  toIndex: number,
) {
  if (
    fromIndex < 0 ||
    fromIndex >= draft.waypoints.length ||
    toIndex < 0 ||
    toIndex >= draft.waypoints.length ||
    fromIndex === toIndex
  ) {
    return draft;
  }

  const waypoints = [...draft.waypoints];
  const [waypoint] = waypoints.splice(fromIndex, 1);
  waypoints.splice(toIndex, 0, waypoint!);
  return { ...draft, waypoints };
}

export function swapRouteEndpoints(draft: RouteDraft) {
  if (draft.waypoints.length < 2) {
    return draft;
  }

  const waypoints = [...draft.waypoints];
  const first = waypoints[0]!;
  waypoints[0] = waypoints.at(-1)!;
  waypoints[waypoints.length - 1] = first;
  return { ...draft, waypoints };
}

export function getDefaultRouteName(
  waypoints: CycleRouteWaypoint[],
  formatName: (start: string, finish: string) => string,
) {
  if (waypoints.length < 2) {
    return '';
  }

  return formatName(waypoints[0]!.label, waypoints.at(-1)!.label);
}

export function hasDistinctRouteEndpoints(waypoints: CycleRouteWaypoint[]) {
  if (waypoints.length < 2) {
    return false;
  }

  const first = waypoints[0]!;
  const last = waypoints.at(-1)!;
  return (
    Math.abs(first.latitude - last.latitude) > 0.00001 ||
    Math.abs(first.longitude - last.longitude) > 0.00001
  );
}

export function canCalculateRoute(draft: RouteDraft) {
  return (
    draft.waypoints.length >= 2 &&
    draft.waypoints.length <= CYCLESTREETS_MAX_WAYPOINTS &&
    hasDistinctRouteEndpoints(draft.waypoints)
  );
}

export function buildRouteDraftPreview(draft: RouteDraft): CycleRoute | null {
  if (draft.waypoints.length < 2) {
    return null;
  }

  return {
    plan: draft.plan,
    distanceMeters: 0,
    durationSeconds: 0,
    points: draft.waypoints.map(({ latitude, longitude }) => [
      latitude,
      longitude,
    ]),
    instructions: [],
    source: 'local',
  };
}

export function isRouteDraftMeaningful(draft: RouteDraft) {
  return draft.waypoints.length > 0 || draft.name.trim().length > 0;
}
