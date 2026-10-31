# Weekly review follow-up · 30 October 2026

Reviewed the [23–30 October ChatGPT summary](https://chatgpt.com/c/6a9d7e7a-a710-83eb-9d85-194b5dca2186)
against the checkout and current GitHub evidence on 31 October in Yerevan
(30 October UTC).

## Maintenance and data

The [30 October maintenance check](https://github.com/taugr/neuk-bike/actions/runs/41061278189)
started at 13:12:15 UTC, after the weekly report's 13:00 UTC cutoff, and passed.
The check was delayed, not missing. It found newer OSM publications and a newer
NCN source. Embedded OSM inputs were 29 days old and NCN was 33 days old;
both were within the existing 35-day limit. The weekly job checks metadata;
the monthly job prepares a review artifact and does not publish it.

Both [the custom domain](https://neuk.bike/data/freshness.json) and
[the provider domain](https://neuk-bike.pages.dev/data/freshness.json) still
served the 2 October release when checked during this review.

The combined `pnpm refresh:data` pipeline refreshed parking, cycling places and
NCN, preserving identical parking/POI source hashes. The
[data refresh review](data-refresh-2026-10-31.md) records stable-ID changes,
geometry, country coverage, names, completeness, duplicates, source provenance
and asset budgets. See [data maintenance](data-maintenance.md) for the procedure.

## Measurement

Weather and Wind switches now emit the existing `map_layer_changed` event with
bounded `layer=weather|wind` and boolean `visible`. Restored preferences and
forecast refreshes do not count as switch actions. No new location or forecast
properties are allowed. See the [analytics contract](analytics.md).

Ride start, arrival, stop and recalculation outcomes, parking sharing and GPX
sharing already have instrumentation. Missing organic events alone do not prove
missing implementation. Existing intercepted browser tests exercise these
paths; actual production ingestion and native device share sheets remain
separate checks. There is no new production measurement until deployment.

## Dependencies

The build exposed an advisory for the installed Next.js version. A production
dependency audit also found DOMPurify advisories through PostHog. The targeted
updates preserve the existing major versions and package range conventions:

| Package   | Previous | Updated | Scope                                 |
| --------- | -------- | ------- | ------------------------------------- |
| Next.js   | 16.4.0   | 16.4.3  | Direct dependency and matching SWC    |
| DOMPurify | 3.4.16   | 3.4.17  | Existing PostHog dependency, lockfile |

`pnpm audit --prod --json` reports zero known vulnerabilities after the updates.
Relevant advisories include [Next.js image optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw),
[Next.js cache functions](https://github.com/advisories/GHSA-673q-mjm6-r5xr),
and [DOMPurify](https://github.com/advisories/GHSA-cg2g-xh64-v4q7).
This project serves a static export with unoptimized images, no Server Actions
and no runtime Next.js server; those Next.js server attack paths are not part
of its deployed architecture. This is a dependency update, not a security audit.

[PR #63](https://github.com/taugr/neuk-bike/pull/63) and
[PR #70](https://github.com/taugr/neuk-bike/pull/70) were mergeable with passing
quality checks at review time. Neither was merged. The other package updates,
pnpm update and any change to the product's weather/data-quality priorities
remain separate decisions.

## Release boundary

Dataset integrity, all 701 unit tests, nine analytics scenarios, lint,
formatting and the production build pass. The browser run has two terrain
readiness failures under parallel load; both pass twice sequentially with
traces. See the [verification details](data-refresh-2026-10-31.md#verification)
for the exact limits.

Publication of the reviewed dataset, measurement and dependency changes was
authorized on 31 October 2026. The release uses a push to `main`, the GitHub
Actions quality gate and the existing Cloudflare Pages deployment workflow.
Production verification must confirm the exact pushed revision, both public
domains, dataset hashes and the affected user journeys.
