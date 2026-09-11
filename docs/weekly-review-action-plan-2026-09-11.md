# Changes proposed after the 11 September weekly review

Status: original review and proposed scope, subsequently approved for implementation
and release on 11 September. See `analytics.md` and `data-maintenance.md` for
the implemented contracts. The optional civic pilot remains a separate decision.

The input was the 4–11 September report in
[Bike Nook Status Summary](https://chatgpt.com/c/6a9d7e7a-a710-83eb-9d85-194b5dca2186).
The recommendations below were checked against the current checkout, live
PostHog dashboard, upstream data metadata, and live app entry screen.

## Recommendation

Prioritize trustworthy data and measurement, then make a small route-entry
improvement. Preserve the app's parking-first, mobile, static architecture.
Treat a move into civic analysis as a product decision requiring a defined
pilot, rather than a consequence of this week's commit mix.

## What the evidence actually supports

| Finding                                      | Checked evidence                                                                                                                                                                                                                                                                                                                                   | Implication                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| OSM inputs are old                           | All 70 parking and POI inputs have timestamps between 14 and 23 July. Parking was rebuilt 20 August; POIs 4 August.                                                                                                                                                                                                                                | Build date is not source freshness.                                                                                      |
| Fresh upstream data exists                   | [Geofabrik Scotland](https://download.geofabrik.de/europe/united-kingdom/scotland.html) includes edits through 10 September. [NCN](https://services5.arcgis.com/1ZHcUS1lwPTg4ms0/arcgis/rest/services/National_Cycle_Network_Public/FeatureServer/0) currently returns 37,206 records versus the stored 37,209, with a 6 September edit timestamp. | Refresh and inspect feature-level changes; the net count difference alone does not identify removed or changed segments. |
| Refresh commands can reuse old inputs        | Parking and POI download helpers accept any existing nonempty cached file unless `--force-download` is supplied.                                                                                                                                                                                                                                   | A routine rebuild can silently preserve stale data.                                                                      |
| Dashboard no longer matches journeys         | [Dashboard 689478](https://eu.posthog.com/project/182017/dashboard/689478) still requires `directions_requested` and `directions_loaded`. Current finder code does not emit these.                                                                                                                                                                 | Replace the active funnel; retain the old definition as historical context.                                              |
| Route metrics miss successful paths          | Short routes and cache hits return before `route_calculated`; `openJourneyToParking` skips planner-open and destination-selected captures; resuming a draft also skips the open event.                                                                                                                                                             | The report's 8 opens and 2 calculations are event totals, not a verified 25% conversion rate.                            |
| Location metrics conflate different outcomes | `location_requested` is attached to one UI control; startup, journey location, and ride tracking use other paths. `location_denied` also includes unavailability and outside-coverage results.                                                                                                                                                     | Count attempts centrally and separate permission from position/coverage outcomes.                                        |
| Dashboard scope is incomplete                | Project 182017 lists multiple sites. Dashboard and tile property filters are empty; test-account filtering is disabled.                                                                                                                                                                                                                            | Explicitly isolate production Neuk Bike traffic before interpreting totals.                                              |

Weekly usage figures remain attributed to the ChatGPT report; this review did
not rerun its historical queries. Current traffic is too small to justify
trend or redesign claims. No full mobile usability audit was performed.

## 1. Refresh and validate all three datasets

Deliver a reviewed refresh of parking, cycling places, and NCN with a concise
before/after report. Keep refresh output separate from normalizer changes so
source changes can be distinguished from transformation changes.

Suggested execution sequence, once implementation is requested:

```sh
pnpm update:data --force-download
pnpm update:pois
pnpm update:network
pnpm verify:data
pnpm verify:pois
pnpm verify:network
```

Parking downloads the full set first; POIs then reuse those exact fresh PBFs.
Verify all 70 inputs are present and their checksums agree across the two
reports. Do not run a partial `--regions` refresh into release directories:
the scripts replace generated output and a subset could shrink coverage.
Use an isolated staging checkout/output and preserve the previous release
until the complete set passes validation.

Review additions, removals, changed attributes/geometry, per-country counts,
field completeness, naming tiers and samples, discarded records, regional
duplicates, council/OSM matches, source dates, checksums, and asset budgets.
Inspect NCN changes by stable feature identity, not just total counts.
Refresh snapshot numbers in README while preserving attribution.

Acceptance: all three verifiers pass; explain material deltas; check sample
locations across coverage, saved-neuk resolution, shared parking links,
network/POI layers, and offline cache upgrades. Run the repository checks and
E2E suite against the resulting export before any authorized release.

## 2. Repair analytics at the state transitions

Main files: `src/components/cycle-parking-finder.tsx`, `src/lib/analytics.ts`,
`instrumentation-client.ts`, with focused helper tests and journey/location/
ride E2E coverage. Extract small typed event helpers where they reduce
inconsistent captures; avoid a broad finder refactor.

Proposed event contract:

| Area            | Events and semantics                                                                                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planner entry   | Emit `route_planner_opened` for each deliberate entry, with bounded `source` and `resumed` properties. Cover map, parking, library, shared/imported routes, and WebMCP where applicable.                                                                                                    |
| Destination     | Emit `route_destination_selected` when a destination is committed from search, parking, or map placement. Start selection is a separate event. Restoring a saved route is not a new destination selection.                                                                                  |
| Calculation     | Emit a request event, `route_calculated` on every successful result including cache/short-route paths, and a failure event with a bounded reason. Attach `result_source` such as API/cache/short-route. Ignore superseded callbacks.                                                        |
| Location        | Emit one attempt and one terminal result per request, with `trigger=automatic/manual` and `purpose=finder/route_start/ride`. Distinguish granted position, permission denial, timeout, unavailable, outside coverage, and cancelled requests. Cached-area restoration is not a GPS request. |
| Ride            | Capture start intent, successful tracking start, reroute request/success/failure, arrival, and explicit stop. Fire arrival once per ride. Do not count every GPS update or unmount as an abandonment.                                                                                       |
| Useful outcomes | Preserve save/share/export events and include both native sharing and clipboard copying. Define success at the completed operation.                                                                                                                                                         |

Use short-lived, random journey/attempt identifiers if needed for pairing;
never derive them from coordinates or saved-route identifiers. Keep property
values bounded and omit search text, place names, parking IDs, precise
coordinates, route geometry, and location-bearing URL payloads. The existing
code sends some place names/parking IDs and redacts only `lat`/`lng` URL
parameters, so audit existing captures as part of the same change.

Preserve cookieless analytics and local-development exclusion. Distinguish
explicit cancellation from inferred inactivity; browser termination does not
reliably emit an event. Add an event-schema version and deployment annotation
so old and repaired measurements are not presented as comparable.

Acceptance: deterministic tests prove exactly one event per transition,
including cache hits, short routes, parking entry, manual/automatic location,
denial, unavailable GPS, reroute failure, and arrival. Inspect outbound
payloads for the stated property restrictions.

## 3. Update the dashboard and weekly interpretation

Depends on the event contract above. Draft the definitions before changing
the existing dashboard. Apply an explicit `neuk.bike` production-site filter
to every insight and verify the available hostname property against the
live schema. Exclude identified test traffic without assuming every owner
visit is a test. Keep other sites' dashboards untouched.

Use separate views for parking discovery, new route planning, restored
routes, and ride reliability. A new-route funnel can follow:

`planner opened → destination selected → calculation succeeded`

Show ride start, save, and share/export as alternative outcomes; users can
save without riding. Do not require restored routes to repeat destination
selection. Break down entry paths and API/cache/short-route results. Pair
steps within the same journey where supported and use a short documented
conversion window instead of the existing 14-day funnel window.

Add location attempts/outcomes by trigger and purpose, plus route errors and
reroute outcomes. Confirm actual cookieless identifier behavior before using
unique-user or cross-session retention figures. The project timezone is UTC;
define explicit weekly boundaries corresponding to Friday 17:00 Yerevan and
display the reporting window.

Acceptance: controlled journeys reconcile with insight results; denominators
and exclusions are visible. The proposed weekly report update should state
sample size, instrumentation changes, source age, and confirmed blockers,
and distinguish observations from product recommendations. Updating the
existing recurring report is a later action, not part of this plan.

## 4. Prevent another stale-data cycle

Add a lightweight source-status check and release freshness manifest recording
per-input dates, hashes, retrieval dates, and the oldest/newest source age.
Use upstream validators where available; make cache reuse an explicit rebuild
mode and fresh acquisition a documented refresh mode.

Proposed operating cadence: weekly upstream metadata checks and a monthly
full OSM refresh, with earlier refreshes for meaningful changes. Generate a
reviewable diff/PR rather than automatically publishing changed data. Choose
the runner only after checking storage, runtime, memory, and secret access.
Nothing is scheduled by this plan.

Stage and verify parking/POI outputs before replacing the previous complete
release, following the network updater's existing staging pattern. Show a
compact source-age explanation in existing attribution/data details rather
than adding map controls. Mark mixed-age or incomplete input sets clearly.

Acceptance: a stale cache is detectable, failed refreshes preserve a usable
release, and a source change cannot be mistaken for a successful deployment.

## 5. Focused UX follow-up and optional civic pilot

After measurement repairs, review the previous compact route-entry concept:
place route entry within or beside the existing search chrome, preserving
one-tap access and draft restoration. The live app still has the standalone
map button. Preview the mobile and desktop treatment before implementation;
test parking-to-route, destination-first routing, no-location start selection,
back navigation, keyboard focus, and small-screen map visibility.

Do not use the current 8/2 counts as evidence that this change will improve
conversion. Judge the first iteration through observed task completion and
map space, then collect correctly measured usage.

If civic analysis remains a priority, define one separate Edinburgh pilot:
a reviewable list of council/OSM discrepancies and potentially unmapped
parking near selected destinations, with provenance, timestamps, transparent
distance rules, and CSV/GeoJSON export. Treat candidates as hypotheses for
manual validation: absence from OSM does not prove physical parking is
missing. Field verification and a named intended audience should precede
public claims, advocacy, or automated reporting.

## Delivery order

1. Reviewed dataset refresh.
2. Analytics event coverage and privacy tests.
3. Dashboard definitions and weekly-report corrections.
4. Repeatable freshness/staging workflow.
5. Compact route-entry preview; separately decide the civic pilot.

Data refresh and analytics design can proceed independently. Dashboard
validation depends on instrumentation. Product expansion does not block
either. When release is authorized, verify the exact remote commit, CI,
Cloudflare deployment, both production URLs, and representative journeys.
