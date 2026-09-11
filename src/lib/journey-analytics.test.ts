import { describe, expect, it, vi } from 'vitest';
import {
  createLocationAttempt,
  createRideAnalytics,
  createRouteAttempt,
  locationErrorOutcome,
} from '@/lib/journey-analytics';

describe('location measurement', () => {
  it.each(['automatic', 'manual'] as const)(
    'pairs each %s attempt with exactly one result',
    (trigger) => {
      const capture = vi.fn();
      const attempt = createLocationAttempt(
        { trigger, purpose: 'finder' },
        capture,
      );
      attempt.finish('timeout');
      attempt.finish('located');
      attempt.finish('cancelled');
      expect(capture.mock.calls.map((call) => call[0])).toEqual([
        'location_requested',
        'location_resolved',
      ]);
      expect(capture.mock.calls[1]![1]).toMatchObject({
        ...capture.mock.calls[0]![1],
        outcome: 'timeout',
      });
    },
  );
  it('distinguishes permission denial, timeout, and unavailable position', () => {
    expect([1, 2, 3].map((code) => locationErrorOutcome({ code }))).toEqual([
      'denied',
      'unavailable',
      'timeout',
    ]);
  });
});

describe('route calculation measurement', () => {
  it.each(['api', 'cache', 'short_route'] as const)(
    'counts a %s success once',
    (source) => {
      const capture = vi.fn();
      const attempt = createRouteAttempt({ stop_count: 2 }, capture);
      attempt.success(source, 3);
      attempt.cancel();
      attempt.fail('request_failed');
      expect(capture.mock.calls.map((call) => call[0])).toEqual([
        'route_calculation_requested',
        'route_calculated',
      ]);
      expect(capture.mock.calls[1]![1]).toMatchObject({
        result_source: source,
        stop_count: 2,
      });
    },
  );
  it('ignores a late success after an invalidated request', () => {
    const capture = vi.fn();
    const attempt = createRouteAttempt({}, capture);
    attempt.cancel();
    attempt.success('api', 3);
    expect(capture.mock.calls.map((call) => call[0])).toEqual([
      'route_calculation_requested',
      'route_calculation_cancelled',
    ]);
  });
  it('separates reroute failures from normal route failures', () => {
    const capture = vi.fn();
    const attempt = createRouteAttempt({}, capture, true);
    attempt.fail('offline');
    attempt.cancel();
    expect(capture.mock.calls.map((call) => call[0])).toEqual([
      'ride_recalculation_requested',
      'ride_recalculation_failed',
    ]);
  });
});

describe('ride measurement', () => {
  it('counts tracking and arrival once despite repeated GPS fixes', () => {
    const capture = vi.fn();
    const ride = createRideAnalytics(capture);
    ride.arrive();
    ride.start();
    ride.start();
    ride.arrive();
    ride.arrive();
    ride.stop('user');
    ride.stop('context_changed');
    expect(capture.mock.calls.map((call) => call[0])).toEqual([
      'ride_start_requested',
      'ride_started',
      'ride_completed',
      'ride_stopped',
    ]);
    expect(capture.mock.calls.at(-1)![1]).toMatchObject({
      started: true,
      arrived: true,
      reason: 'user',
    });
    expect(
      new Set(capture.mock.calls.map((call) => call[1].ride_id)).size,
    ).toBe(1);
  });
  it('does not count a failed location request as a started or completed ride', () => {
    const capture = vi.fn();
    const ride = createRideAnalytics(capture);
    ride.stop('location_error');
    ride.start();
    ride.arrive();
    expect(capture.mock.calls.map((call) => call[0])).toEqual([
      'ride_start_requested',
      'ride_stopped',
    ]);
  });
});
