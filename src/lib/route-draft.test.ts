import { describe, expect, it } from 'vitest';
import {
  addRouteWaypoint,
  buildRouteDraftPreview,
  canCalculateRoute,
  createRouteDraft,
  getDefaultRouteName,
  isRouteDraftMeaningful,
  moveRouteWaypoint,
  removeRouteWaypoint,
  swapRouteEndpoints,
  updateRouteWaypoint,
} from '@/lib/route-draft';
import {
  CYCLESTREETS_MAX_WAYPOINTS,
  type CycleRouteWaypoint,
} from '@/lib/cyclestreets';

function waypoint(id: string, latitude: number): CycleRouteWaypoint {
  return {
    id,
    label: id.toUpperCase(),
    latitude,
    longitude: -3.2,
    source: 'map',
  };
}

describe('route drafts', () => {
  it('adds, updates, removes, and reorders stops immutably', () => {
    const start = waypoint('start', 55.95);
    const via = waypoint('via', 55.96);
    const finish = waypoint('finish', 55.97);
    const draft = addRouteWaypoint(
      addRouteWaypoint(createRouteDraft('draft', start), via),
      finish,
    );

    expect(
      moveRouteWaypoint(draft, 2, 1).waypoints.map(({ id }) => id),
    ).toEqual(['start', 'finish', 'via']);
    expect(
      updateRouteWaypoint(draft, 'via', { ...via, label: 'Canal' }).waypoints[1]
        ?.label,
    ).toBe('Canal');
    expect(
      removeRouteWaypoint(draft, 'via').waypoints.map(({ id }) => id),
    ).toEqual(['start', 'finish']);
    expect(draft.waypoints.map(({ id }) => id)).toEqual([
      'start',
      'via',
      'finish',
    ]);
  });

  it('swaps endpoints while keeping intermediate stops in place', () => {
    const draft = [
      waypoint('start', 55.95),
      waypoint('via', 55.96),
      waypoint('finish', 55.97),
    ].reduce(
      (current, candidate) => addRouteWaypoint(current, candidate),
      createRouteDraft('draft'),
    );

    expect(swapRouteEndpoints(draft).waypoints.map(({ id }) => id)).toEqual([
      'finish',
      'via',
      'start',
    ]);
  });

  it('validates distinct endpoints and derives a useful default name', () => {
    const start = waypoint('start', 55.95);
    const finish = waypoint('finish', 55.97);
    const draft = addRouteWaypoint(
      addRouteWaypoint(createRouteDraft('draft'), start),
      finish,
    );

    expect(canCalculateRoute(draft)).toBe(true);
    expect(
      getDefaultRouteName(
        draft.waypoints,
        (start, finish) => `${start} towards ${finish}`,
      ),
    ).toBe('START towards FINISH');
    expect(
      canCalculateRoute({
        ...draft,
        waypoints: [start, { ...start, id: 'same' }],
      }),
    ).toBe(false);
  });

  it('caps route drafts at the provider waypoint limit', () => {
    const draft = Array.from(
      { length: CYCLESTREETS_MAX_WAYPOINTS },
      (_, index) => waypoint(`stop-${index + 1}`, 55.95 + index / 1_000),
    ).reduce(
      (current, candidate) => addRouteWaypoint(current, candidate),
      createRouteDraft('maximum'),
    );

    expect(draft.waypoints).toHaveLength(CYCLESTREETS_MAX_WAYPOINTS);
    expect(canCalculateRoute(draft)).toBe(true);
    expect(addRouteWaypoint(draft, waypoint('extra', 56))).toBe(draft);
  });

  it('builds a lightweight straight-line preview without calculating a route', () => {
    const draft = [
      waypoint('start', 55.95),
      waypoint('via', 55.96),
      waypoint('finish', 55.97),
    ].reduce(
      (current, candidate) => addRouteWaypoint(current, candidate),
      createRouteDraft('draft'),
    );

    expect(buildRouteDraftPreview(draft)).toMatchObject({
      distanceMeters: 0,
      durationSeconds: 0,
      instructions: [],
      plan: draft.plan,
      points: [
        [55.95, -3.2],
        [55.96, -3.2],
        [55.97, -3.2],
      ],
      source: 'local',
    });
    expect(buildRouteDraftPreview(createRouteDraft('empty'))).toBeNull();
  });

  it('treats the first deliberate point as meaningful route work', () => {
    const empty = createRouteDraft('empty');

    expect(isRouteDraftMeaningful(empty)).toBe(false);
    expect(
      isRouteDraftMeaningful(addRouteWaypoint(empty, waypoint('start', 55.95))),
    ).toBe(true);
    expect(isRouteDraftMeaningful({ ...empty, name: 'Canal loop' })).toBe(true);
  });
});
