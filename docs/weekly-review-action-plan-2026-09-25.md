# Weekly review follow-up · 25 September 2026

The 18–25 September report in [Bike Nook Status Summary](https://chatgpt.com/c/6a9d7e7a-a710-83eb-9d85-194b5dca2186)
was reviewed against GitHub, the app, and controlled PostHog test traffic.

## Maintenance findings and changes

- The Friday source check was delayed, not missing: [run 36139631386](https://github.com/taugr/neuk-bike/actions/runs/36139631386)
  started at 13:13 UTC and passed at 13:14 UTC. Move the weekly schedule to
  06:23 UTC, the monthly refresh to 02:23 UTC, and expose the status artifact
  in the job summary. Scheduling remains best-effort, as described in
  [GitHub's workflow troubleshooting guidance](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows).
- Refresh all 70 OSM inputs, parking, cycling places, and the official NCN
  feed together. Keep the monthly reviewed-release policy; newer upstream
  publications alone do not justify unattended production data changes.
- PR #62's remaining updates are pnpm 12.6.0, oxfmt 0.70.0, and Wrangler
  4.137.0. Renovate's artifact failure was `corepack use pnpm@12.6.0` trying a
  frozen install while the oxfmt/Wrangler manifest no longer matched the
  lockfile. Regenerate the lockfile and isolate future pnpm updates from the
  grouped dependency PR. Preserve the release-age policy and frozen CI gate.
- Correct the analytics reporting contract: `parking_link_shared` is native
  sharing, `parking_link_copied` is successful clipboard fallback. Include
  both outcomes and distinguish test evidence from normal usage totals.

## Verification scope

The eight intercepted analytics browser tests cover API/cache calculations,
location pairing, short routes, ride arrival, manual denial, parking native
share/copy/cancellation/failure, and route save/link/GPX outcomes. They check
outgoing payloads without sending test fixtures to PostHog. Native share API
success is mocked; this does not prove an operating-system share sheet.

Controlled live QA uses `?analyticsTest=1`. A real CycleStreets route from
Edinburgh Waverley to Haymarket calculated, saved locally, copied its route
link, and used the GPX download fallback. Synthetic GPS exercised start,
arrival and stop. Parking link copying also completed. Temporary browser
API overrides are removed by reloading the test tab. Test traffic is excluded
from ordinary dashboard totals; it cannot establish adoption or physical GPS
reliability. The native share sheet remains a real-device verification limit.

PostHog confirmed 19 schema-2 test events across 17 event types between
13:49 and 13:56 UTC on 25 September: one calculation request/success, one
route save, one parking copy, one route link copy, one GPX download, and one
each of ride intent/start/arrival/stop. The ride events share one temporary
ride ID; stop records `arrived=true`. Inspected outbound payloads contain no
tested place names, coordinates, or location-bearing query/fragment. Native
sharing produced no live success event and is covered only by the mocked test.

## Recommended next sprint

Prioritize data quality and a bounded Edinburgh missing-parking pilot after
this maintenance release. Keep navigation stable except for verified defects.
The pilot should produce a reviewable council/OSM discrepancy list with stable
IDs, provenance, source dates, explicit matching distances, and CSV/GeoJSON
exports. Start with a small set of public destinations and field-check a
sample before making claims. Missing data is a candidate for investigation,
not proof that parking is physically absent. Public civic reporting is a later
step after the audience and findings are validated.

This recommendation records a direction for planning; it does not introduce
a new civic-reporting feature or alter the recurring ChatGPT task.
