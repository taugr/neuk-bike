const countProperties = new Set([
  'result_count',
  'result_rank',
  'plan_count',
  'stop_count',
  'saved_count',
  'active_filter_count',
  'minimum_capacity',
  'candidate_count',
  'route_comparisons',
  'rank',
  'point_count',
]);
const booleanProperties = new Set([
  'error',
  'resumed',
  'visible',
  'cargo_bike',
  'covered',
  'frame_lockable',
  'public_access',
  'route_comparison_available',
  'started',
  'arrived',
]);
const values: Record<string, readonly string[]> = {
  source: [
    'menu',
    'saved-routes',
    'map',
    'parking',
    'search',
    'shared',
    'import',
    'library',
    'webmcp',
    'list',
    'popup',
    'details',
    'details_preview',
    'current-location',
  ],
  trigger: ['automatic', 'manual'],
  purpose: ['finder', 'route_start', 'ride'],
  outcome: [
    'located',
    'denied',
    'timeout',
    'unavailable',
    'outside_coverage',
    'cancelled',
  ],
  reason: [
    'missing_key',
    'offline',
    'request_failed',
    'no_remaining_waypoints',
    'superseded',
    'user',
    'context_changed',
    'location_error',
  ],
  result_source: ['api', 'cache', 'short_route'],
  route_kind: ['planned', 'imported'],
  neuk_kind: ['parking', 'cycling-place'],
  plan: ['balanced', 'quietest', 'fastest'],
  route_plan: ['balanced', 'quietest', 'fastest'],
  method: ['shared', 'copied', 'downloaded'],
  theme: ['system', 'light', 'dark'],
  language: ['en', 'gd', 'es', 'hy'],
  sort_mode: ['nearest', 'best-match'],
  layer: ['national_cycle_network', 'drinking_water'],
};
const idProperties = new Set(['journey_id', 'attempt_id', 'ride_id']);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Only bounded, explicitly understood custom properties leave the browser. */
export function sanitizeAnalyticsProperties(
  properties: Record<string, unknown> = {},
) {
  return Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => {
      if (countProperties.has(key))
        return (
          typeof value === 'number' &&
          Number.isInteger(value) &&
          value >= 0 &&
          value <= 1_000_000
        );
      if (booleanProperties.has(key)) return typeof value === 'boolean';
      if (typeof value !== 'string') return false;
      if (idProperties.has(key)) return uuidPattern.test(value);
      if (key === 'category')
        return (
          value
            .split(',')
            .every((category) =>
              ['parking', 'shop', 'repair', 'hire', 'water'].includes(category),
            ) && value.length <= 35
        );
      return values[key]?.includes(value) ?? false;
    }),
  );
}

export function redactAnalyticsUrl(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    const url = new URL(value);
    // A route can be encoded in either query parameters or a fragment.
    return `${url.origin}${url.pathname}`;
  } catch {
    return '';
  }
}
