# Journey measurement, schema 2

Custom events carry `app=neuk-bike` and `analytics_schema_version=2`.
Use `$host=neuk.bike` in every production insight. Exclude events explicitly
marked as internal/test traffic; do not infer that all owner visits are tests.
Controlled live checks use `?analyticsTest=1`, which sets `is_test=true` on
outgoing events for that page only. Dashboard SQL excludes this flag as well
as PostHog's internal/test-person property. The query itself is redacted.
Do not combine these measurements with the old directions funnel or infer
conversion by dividing unrelated event totals.

| Area            | Definition                                                                                                                                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planner         | `route_planner_opened` starts a random in-memory `journey_id`, with bounded `source` and `resumed`. New search/parking/map destinations emit `route_destination_selected`; restoring a route does not.                                                                 |
| Calculation     | `route_calculation_requested` creates an `attempt_id`; exactly one calculated, failed or cancelled result follows while the page remains active. `route_calculated.result_source` is `api`, `cache` or `short_route`.                                                  |
| Location        | `location_requested` and `location_resolved` share an `attempt_id`, `trigger` (automatic/manual) and `purpose` (finder/route_start/ride). Outcomes are located, denied, timeout, unavailable, outside_coverage or cancelled. Cached area restoration is not a request. |
| Ride            | `ride_start_requested`, `ride_started`, `ride_completed` and `ride_stopped` share a temporary `ride_id`. Arrival occurs once. Stop records whether tracking started and arrival occurred. Rerouting has separate requested/recalculated/failed/cancelled events.       |
| Useful outcomes | Completed save, share, copy and export operations remain independent outcomes; riding is not required for a successful saved route.                                                                                                                                    |

The property allowlist omits search strings, place names, parking IDs,
coordinates and route geometry. URL query strings and fragments are removed
before sending. Identifiers are random, live only in memory, and are never
derived from or saved with a route. Cookieless mode is preserved; person
profiles and session recording are disabled. Browser termination cannot
reliably emit cancellation or stop and is not labelled abandonment.
Automatic exception capture is disabled because arbitrary messages and stack
URLs can contain request data; route failures use bounded reason codes.

PostHog's ordinary person funnel can join separate route attempts. Use
journey-grouped SQL for the main funnel: opened → selected → calculated,
in timestamp order within one hour of opening, schema 2 and production host
only, excluding `resumed=true` entries. Show restored-route entries separately.
Count unique attempt IDs for location reliability and unique ride IDs for
starts/arrivals. Display raw counts and explicit denominators alongside any
rate. Cookieless identifiers do not support reliable cross-session retention;
daily browser estimates are not people counts.

`pnpm test:analytics` builds with an intercepted test key and checks outgoing
SDK payloads through ordinary UI journeys. It does not send events to the
production project. Helper tests cover duplicate callbacks, cancellation,
location error classification and bounded properties.

## Weekly report contract

Use a half-open seven-day window ending Friday 17:00 Asia/Yerevan (13:00 UTC),
and show both exact UTC boundaries. Report sample sizes before percentages,
source timestamps before build dates, and verified blockers before hypotheses.
Separate new planning, restored routes, parking discovery, useful outcomes,
location reliability and ride reliability. State the schema-2 deployment time
when a window straddles the change; do not compare repaired counts directly
with the old event definitions. Eight planner opens and two calculations in
the original report were event totals, not a measured 25% conversion rate.

Keep recommendations proportionate to the small sample. The existing recurring
ChatGPT report is not changed by this repository contract.
