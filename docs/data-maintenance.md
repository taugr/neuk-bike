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
mismatch. `--upstream` also requests Geofabrik HTTP metadata and NCN's edit
timestamp. A newer PBF publication indicates availability, not changed features.
The report is `.cache/source-status.json`. Source dates and retrieval dates
are separate in `public/data/freshness.json`; cached files are accepted as
retrieval evidence only when their hash matches the report.

The **Data maintenance** GitHub workflow runs metadata checks every Friday at
08:00 UTC and a complete refresh on the first of each month at 02:00 UTC.
Manual dispatch can request either. It has read-only repository permissions
and never deploys. Refresh runs upload a binary Git patch, release archive,
and status report retained for 30 days. A failed check leaves diagnostic
artifacts; it is not proof of a usable release. Review and apply the patch in
a clean checkout, run the quality gates, and commit/push only when authorized.

For every release, inspect stable-ID additions/removals, changed geometry and
attributes, country coverage, completeness, naming samples, discarded features,
regional and council duplicate matches, source hashes and asset budgets. Run
all three verifiers, unit tests, lint, formatting, build and affected browser
journeys. Check saved/shared parking, map layers and offline updates. A source
refresh becomes public only after the exact pushed SHA passes CI and the
Cloudflare deployment is checked on both `neuk.bike` and `neuk-bike.pages.dev`.
