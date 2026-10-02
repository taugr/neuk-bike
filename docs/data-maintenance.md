# Data maintenance

`pnpm refresh:data` downloads all 70 OSM inputs, builds parking, reuses those
exact files for cycling places, then downloads NCN. Each dataset is verified
before the complete release is installed. Normalization and naming rules are
unchanged by a source refresh. Review the generated reports and record-level
diff before committing; pushing `main` deploys.

`pnpm update:data`, `pnpm update:pois`, and `pnpm update:network` use the same
staging process for one dataset. OSM downloads are fresh by default. An explicit
`--cached` rebuild reuses PBFs; council and NCN requests still fetch their feeds.
Prefer the combined command when publishing so parking and POI hashes agree.
Do not invoke the underlying scripts with a regional subset for a release.

Staging lives under `.cache/data-release-*`; a failed update leaves the current
release intact. Completed promotions retain the previous paths in `.previous`.
Promotion rollback handles ordinary filesystem errors; an interrupted process
or machine failure requires inspecting these paths before continuing. The
`.cache/data-refresh.lock` directory prevents concurrent refreshes. Remove a
leftover lock only after confirming no refresh process remains. Keep adequate
space for about 4 GB of inputs plus both generated releases and build output.
Use the repository's Node version for generation and verification: gzip sizes
can differ between Node/zlib versions even when dataset bytes are identical.
The wrapper runs both with the same Node executable.

`pnpm check:data` fails for missing/unknown inputs, an oldest source date more
than 35 days old, OSM date spreads exceeding two days, or parking/POI hash
mismatch. `--upstream` also requests official Geofabrik publication pages,
HEAD metadata and at most 64 KiB of each PBF to verify its actual OSM cutoff,
plus NCN's edit timestamp. A newer cutoff indicates availability, not changed
features; a later retrieval or file modification time does not make data newer.
The report is `.cache/source-status.json`. Source dates and retrieval dates
are separate in `public/data/freshness.json`; cached files are accepted as
retrieval evidence only when their hash matches the report.

A fresh refresh first validates all 70 configured OSM publications once, then
pins their **dated** URLs, exact sizes, real cutoffs and validation times in a
plan inside that invocation's staging directory. The plan binds to the code
revision and a unique invocation, expires after two hours, and requires the full
source set with the existing 35-day age and two-day spread limits. An earlier
check-only report is diagnostic; it is never imported as trusted refresh input.
The release uses the publications validated at preflight even if a newer
publication appears during the build. Dates are never advanced to the build day.

The shared resolver supplies the plan and also powers standalone upstream checks.
A failed latest alias falls back only to the current dated extract
identified on that region's official Geofabrik page. The resolver rejects
foreign hosts, other regions/dates, stale or future cutoffs, missing/ambiguous
publication records, malformed redirects, HTML bodies and mismatched sizes or
PBF timestamps. Redirects and transient retries are bounded, with URL, status,
attempt and nested network errors logged. Publication HTML, including its body,
gets three 30-second attempts with five- and fifteen-second backoffs for transient
network/timeouts, HTTP 429 and 5xx. Permanent and integrity failures remain hard
errors. HEAD/range requests and full-file retries retain their existing bounds.
The upstream report records the resolved URL and whether fallback was used; fresh acquisition reports retain
the canonical source URL and add the actual `downloadUrl`.

Downloads stream into temporary files, checking their complete byte count,
SHA-256, PBF framing and compressed blocks before atomically replacing the
cache. Extraction verifies the cutoff and hash again. Full-download retries keep
the same pinned dated URL without re-fetching publication pages. POI cache reuse
requires the plan's exact size/cutoff and a matching full-file SHA receipt from
this invocation; an older age-valid cache cannot stand in for a planned input.
The final gate compares both reports with the plan and receipts before promotion.
Per-input reports/freshness retain the plan ID, publication and validation times.
The explicit `--cached` rebuild keeps its existing semantics without creating a
fresh-publication plan. An invalid download leaves its previous cached input
intact; any refresh failure preserves the previous release. The staging gate rejects
stale, future, incomplete or mixed-age OSM inputs even during a cached rebuild.
If official publication metadata is unavailable or inconsistent, the refresh
fails rather than selecting an arbitrary older file. Inspect the logged source
URL and error before retrying; do not manually relabel cached data as fresh.

The **Data maintenance** GitHub workflow runs metadata checks every Friday at
06:23 UTC and a complete refresh on the first of each month at 02:23 UTC.
The earlier Friday check leaves more time before the weekly report. GitHub
schedules are best-effort and may be delayed; check the actual run before
reporting a missed check. Each run includes its source report in the job summary.
Manual dispatch can request either. It has read-only repository permissions
and never deploys. Refresh runs upload a binary Git patch, release archive,
status report, publication plan and full-file receipts retained for 30 days.
Refresh status describes the pinned publications and actual NCN acquisition;
post-build verification checks installed provenance without fetching OSM pages
again. Check-only runs still inspect current upstream availability. Council feeds,
coverage polygons and NCN acquisition still make their normal network requests;
a plan cannot guarantee those feeds or the pinned PBF downloads stay available.
A failed check leaves diagnostic artifacts; it is not proof of a usable release. Review and apply the patch in
a clean checkout, run the quality gates, and commit/push only when authorized.

For every release, inspect stable-ID additions/removals, changed geometry and
attributes, country coverage, completeness, naming samples, discarded features,
regional and council duplicate matches, source hashes and asset budgets. Run
all three verifiers, unit tests, lint, formatting, build and affected browser
journeys. Check saved/shared parking, map layers and offline updates. A source
refresh becomes public only after the exact pushed SHA passes CI and the
Cloudflare deployment is checked on both `neuk.bike` and `neuk-bike.pages.dev`.
