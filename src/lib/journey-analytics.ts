import { captureAnalyticsEvent } from '@/lib/analytics';

type Capture = typeof captureAnalyticsEvent;
type Properties = Record<string, unknown>;
export type LocationOutcome =
  | 'located'
  | 'denied'
  | 'timeout'
  | 'unavailable'
  | 'outside_coverage'
  | 'cancelled';

export function locationErrorOutcome(error: { code: number }): LocationOutcome {
  return error.code === 1
    ? 'denied'
    : error.code === 3
      ? 'timeout'
      : 'unavailable';
}

// Identifiers live only in memory, never contain route data, and are not saved.
export function createAnalyticsId() {
  return crypto.randomUUID();
}

export function createLocationAttempt(
  context: {
    trigger: 'automatic' | 'manual';
    purpose: 'finder' | 'route_start' | 'ride';
  },
  capture: Capture = captureAnalyticsEvent,
) {
  const properties = { ...context, attempt_id: createAnalyticsId() };
  let finished = false;
  capture('location_requested', properties);
  return {
    finish(outcome: LocationOutcome) {
      if (finished) return;
      finished = true;
      capture('location_resolved', { ...properties, outcome });
    },
  };
}

export function createRouteAttempt(
  properties: Properties,
  capture: Capture = captureAnalyticsEvent,
  reroute = false,
) {
  const context = { ...properties, attempt_id: createAnalyticsId() };
  let finished = false;
  capture(
    reroute ? 'ride_recalculation_requested' : 'route_calculation_requested',
    context,
  );
  function finish(event: string, result: Properties) {
    if (finished) return;
    finished = true;
    capture(event, { ...context, ...result });
  }
  return {
    success(resultSource: 'api' | 'cache' | 'short_route', planCount: number) {
      finish(reroute ? 'ride_recalculated' : 'route_calculated', {
        result_source: resultSource,
        plan_count: planCount,
      });
    },
    fail(
      reason:
        | 'missing_key'
        | 'offline'
        | 'request_failed'
        | 'no_remaining_waypoints',
    ) {
      finish(
        reroute ? 'ride_recalculation_failed' : 'route_calculation_failed',
        { reason },
      );
    },
    cancel() {
      finish(
        reroute
          ? 'ride_recalculation_cancelled'
          : 'route_calculation_cancelled',
        { reason: 'superseded' },
      );
    },
  };
}

export function createRideAnalytics(capture: Capture = captureAnalyticsEvent) {
  const rideId = createAnalyticsId();
  let started = false;
  let arrived = false;
  let ended = false;
  const emit: Capture = (event, properties) =>
    capture(event, { ...properties, ride_id: rideId });
  emit('ride_start_requested');
  return {
    capture: emit,
    start() {
      if (started || ended) return;
      started = true;
      emit('ride_started');
    },
    arrive() {
      if (!started || arrived || ended) return;
      arrived = true;
      emit('ride_completed');
    },
    stop(reason: 'user' | 'context_changed' | 'location_error') {
      if (ended) return;
      ended = true;
      emit('ride_stopped', { reason, started, arrived });
    },
  };
}
