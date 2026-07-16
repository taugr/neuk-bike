# UK and Ireland expansion plan

## Final output

A backend-free Bike Neuks release covering the UK and Ireland, deployed as a
static site on the existing Cloudflare Pages project. OpenStreetMap provides the
baseline coverage in both countries, while the City of Edinburgh Council feed
remains the preferred authoritative overlay in Edinburgh.

The browser will continue to download only nearby zoom-12 parking chunks. There
will be no paid API, application server, database, or requirement to download
the complete England dataset in the browser.

The finished release will include:

- reproducible, memory-bounded ingestion for the UK and Ireland;
- deterministic cross-region deduplication and contextual parking names;
- region-aware coverage rather than one oversized rectangular boundary;
- versioned static chunks, a manifest, and an on-demand point index;
- UK-and-Ireland search, metadata, copy, attribution, and test coverage;
- measured data, file-count, refresh-time, memory, and browser payload budgets;
- a documented refresh, deployment, verification, and rollback procedure.

The scope was extended after the England-and-Scotland implementation to include
Wales and the complete island of Ireland. The product therefore describes its
coverage as “UK and Ireland”; it does not imply that the Republic of Ireland is
part of the UK.

## Implementation checkpoint

Status on 16 July 2026: data generation, reproducibility, unit checks, static
build, automated browser verification, and the local browser smoke test are
complete. The local preview is ready for manual review. No Cloudflare preview
or production deployment has been made, and the live release remains unchanged
until manual sign-off.

Measured local release:

| Measure                                      |          Result |                        Plan gate |
| -------------------------------------------- | --------------: | -------------------------------: |
| Combined parking records                     |          68,916 |             55,000–75,000 target |
| OSM records after cross-region deduplication |          68,860 |                         Reviewed |
| Edinburgh council records                    |           1,454 |                         Reviewed |
| Edinburgh OSM duplicates suppressed          |           1,398 |                         Reviewed |
| Cross-region OSM duplicates removed          |             207 |                         Reviewed |
| Zoom-12 chunks                               |           3,213 |       Maximum 8,000 files target |
| Parking release size                         |        20.6 MiB |   50 MB target / 75 MB hard gate |
| Complete static export                       |          35 MiB |  60 MB target / 100 MB hard gate |
| Complete export file count                   |           3,257 |  8,000 target / 15,000 hard gate |
| Largest generated data asset                 |        2.43 MiB | 10 MiB target / 20 MiB hard gate |
| Manifest                                     |         581 KiB |                  1 MiB hard gate |
| Point index                                  |        2.43 MiB |                  5 MiB hard gate |
| Largest compressed 3x3 initial load          |         483 KiB |                  1 MiB hard gate |
| Cached 50-input refresh                      |         14m 32s |                 60 minute target |
| Generator peak resident memory               |        2.63 GiB |                   4 GB hard gate |
| Static Next.js build                         | Under 5 seconds |                 30 second target |

The second cached refresh reproduced all 3,214 content-addressed index and
chunk paths with the same aggregate SHA-256,
`952faa1c1d4a231951ace210f808a378cb01ea63317429ca92e635a8bfb4660f`.
Only refresh metadata changed.

The final automated check passed 92 unit tests and 35 production-style desktop
and mobile browser tests, including representative locations across all four UK
nations and the Republic of Ireland.

## Recommended approach

Keep the current static zoom-12 chunking architecture. It is a good fit for
England because runtime traffic scales with the map area a person visits, not
with the size of the national dataset. Cloudflare Pages can cache the generated
JSON as normal static assets, so parking-data requests do not require paid API
calls or Pages Functions.

Do not extend the current generator with only a larger bounding box and one
hard-coded England URL. England's extract is much larger, and the current
multi-pass naming process holds millions of nearby node coordinates in memory.
The ingestion pipeline must first become region-configured, sequential, and
measured.

Use OpenStreetMap Geofabrik extracts as the baseline. Do not make the first
England release depend on finding and maintaining feeds from dozens of local
authorities. Add local feeds later only where they provide a clear quality gain
and have stable licensing and refresh behavior. Transport for London's open
cycling data is the first optional overlay worth evaluating after the national
baseline is working.

## Research basis and planning assumptions

These figures are planning inputs, not acceptance evidence. They must be
remeasured from the generated release before deployment.

- The current Scotland release contains 5,573 merged records in 516 zoom-12
  chunks. Its parking assets occupy about 3.4 MB and the full static export is
  about 6.1 MB.
- Geofabrik's England PBF is about 1.6 GB, compared with the current cached
  Scotland PBF of about 308 MB.
- Regional Taginfo reported about 57,700 England objects tagged
  `amenity=bicycle_parking`. Together with Scotland, a reasonable initial
  planning range is 55,000–75,000 normalized records after extraction and
  deduplication.
- Linear projection suggests roughly 3,000–6,000 parking files and a 35–45 MB
  static export. The release must be measured rather than relying on that
  projection, especially in dense London chunks.
- Cloudflare Pages currently documents a 20,000-file site limit, a 25 MiB
  maximum per asset, and 500 builds per month on the Free plan. Requests for
  static assets are free and unlimited. The planned release should fit with a
  substantial buffer if assets remain chunked.
- The public Nominatim service permits moderate end-user-triggered search but
  has an absolute maximum of one request per second per application. Retain
  submit-only search and avoid autocomplete. Treat sustained popularity near
  that limit as a separate provider/caching decision rather than silently
  exceeding the policy.

Reference material:

- [Geofabrik England extract](https://download.geofabrik.de/europe/united-kingdom/england.html)
- [Geofabrik regional Taginfo statistics](https://taginfo.geofabrik.de/europe%3Aunited-kingdom%3Aengland/api/4/tag/stats?key=amenity&value=bicycle_parking)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
- [Transport for London open data](https://tfl.gov.uk/info-for/open-data-users/our-open-data?intcmp=3671)

## Target architecture

```text
Regional source config
        |
        +-- Scotland OSM extract ----\
        +-- England OSM inputs -------+--> sequential normalize/name
        +-- Edinburgh council feed --/              |
                                                      v
                                      deterministic ID dedupe
                                      + spatial overlay merge
                                                      |
                                                      v
                                      content-addressed z12 chunks
                                              |       |       |
                                           manifest  index  report
                                              |
                                     Cloudflare static assets
                                              |
                                   browser 3x3 load + 24 LRU
```

The production generator will accept a source catalogue instead of hard-coded
Scotland constants. Each input will declare its region ID, download URL, cache
path, coverage boundary, attribution, and precedence. It will emit one combined
runtime release while preserving per-input evidence in the quality report.

### England input decision

Phase 0 will benchmark the full England PBF through the real extraction and
naming pipeline. Keep it as one input only if a cached refresh stays below the
time and memory budgets. Otherwise, process Geofabrik England subregion extracts
sequentially, release each region's naming context before loading the next, and
deduplicate repeated OSM IDs at boundaries.

The sequential subregion route is the expected production choice because it
reduces peak memory and makes failed refreshes easier to diagnose. The source
configuration must make either choice possible without changing the normalized
output contract.

### Coverage contract

Replace the manifest's single Scotland rectangle with versioned coverage areas.
Use country or regional polygons derived from the corresponding Geofabrik
`.poly` boundaries, simplified enough for a small manifest. A bounding box may
still be stored as an acceleration hint, but it must not be the final coverage
test.

This prevents an oversized rectangle from incorrectly claiming nearby islands
or mainland Europe are covered. Search results and map status messages use the
same coverage helper.

### Chunk versioning

The current timestamped release directory changes every chunk URL on each data
refresh. At England scale that would create unnecessary Git churn and force all
clients to refill their caches even when most chunks are unchanged.

Before committing the first England dataset, move to content-addressed chunk
paths or another scheme in which unchanged chunk content keeps the same URL.
The manifest remains short-lived; referenced chunks and point indexes remain
immutable. The generator will delete unreferenced generated assets as part of a
controlled refresh, not by hand.

## Acceptance budgets

| Measure                                 |                            Target |                            Hard gate / decision |
| --------------------------------------- | --------------------------------: | ----------------------------------------------: |
| Normalized parking records              |                     55,000–75,000 |                       Investigate outside range |
| Parking release size                    |                           ≤ 50 MB |                                   Fail at 75 MB |
| Complete static export                  |                           ≤ 60 MB |                                  Fail at 100 MB |
| Total exported files                    |                           ≤ 8,000 |                                  Fail at 15,000 |
| Largest generated asset                 |                          ≤ 10 MiB |                                  Fail at 20 MiB |
| Manifest                                |                       ≤ 1 MiB raw |                                Fail above 1 MiB |
| Point index                             |                       ≤ 5 MiB raw |                                Fail above 5 MiB |
| Initial parking payload in a dense area |                ≤ 1 MiB compressed |                                Fail above 1 MiB |
| Initial chunk selection                 | Current tile plus one-tile buffer |                                     Maximum 3×3 |
| In-memory browser cache                 |                         24 chunks |                             Must remain bounded |
| Static Next.js build                    |              ≤ 30 seconds locally |                          Investigate regression |
| Cached data refresh                     |                      ≤ 60 minutes |          Change input strategy above 90 minutes |
| Generator peak resident memory          |                            ≤ 4 GB | Use sequential inputs; no heap-limit workaround |

The file and asset hard gates retain headroom below Cloudflare's documented
Free-plan limits. The build-time budget covers the static Next.js export, not
the maintenance-only PBF download and data refresh.

## Phases

### Phase 0 — Baseline and England benchmark

Status: complete with a revised benchmark decision

- [x] Record the Scotland baseline and the combined release's counts, sizes,
      build time, cached refresh time, peak memory, and generated-file churn.
- [x] Add elapsed-time and peak-memory instrumentation for the overall refresh
      and every regional extraction pass.
- [x] Choose sequential county inputs before attempting the 1.6 GB monolithic
      England PBF, based on the existing generator's multi-pass memory shape.
- [x] Validate that representative dense and sparse county inputs share the
      same normalized output contract.
- [x] Confirm the sequential strategy stays within the 60-minute and 4 GB
      gates using a complete cached refresh.
- [x] Confirm the Geofabrik, Cloudflare, Nominatim, and source-licence terms
      used by the implementation and documentation.

The disposable monolithic England benchmark was deliberately skipped. The
production run over 47 sequential county inputs plus Scotland is the stronger
acceptance measurement: it completed in 11m 15s with 2.19 GiB peak RSS and
provides per-input failure isolation.

Deliverable: a checked-in benchmark table and a recorded full-PBF or sequential
subregion decision.

### Phase 1 — Multi-region source configuration

Status: complete locally

- [x] Replace hard-coded Scotland download/cache constants with a validated
      regional source catalogue.
- [x] Keep City of Edinburgh Council as an overlay with higher precedence only
      for likely duplicates in its covered area.
- [x] Download or reuse every configured PBF independently and record its
      timestamp and SHA-256 checksum.
- [x] Process OSM nodes, ways, and relations through the existing normalized
      point schema.
- [x] Emit per-input candidate, geometry, discarded-feature, completeness, and
      naming statistics in the generated report.
- [x] Fail clearly when an expected input is stale, corrupt, empty, or changes
      shape unexpectedly.
- [x] Add focused tests for source configuration, download/cache selection, and
      per-input reporting.

Deliverable: the same generator can build Scotland alone or England and
Scotland from configuration.

### Phase 2 — Scalable merge, naming, and generated assets

Status: complete locally

- [x] Deduplicate OSM records deterministically by source-qualified OSM ID,
      including repeated records at subregion boundaries.
- [x] Replace the council-to-OSM all-record scan with a spatial lookup so merge
      cost does not grow with the complete England dataset.
- [x] Process contextual naming region by region and release nearby-node state
      after each region.
- [x] Preserve the existing useful-name tiers and report counts and review
      samples by region.
- [x] Test naming and deduplication at regional borders and around Edinburgh's
      council overlay.
- [x] Introduce content-addressed or equivalently stable immutable chunk paths.
- [x] Make refresh cleanup remove only generated assets no longer referenced by
      the new manifest.
- [x] Measure working-tree churn and generated release size before committing
      England data.

Deliverable: a bounded-memory, deterministic combined dataset whose unchanged
chunks keep stable URLs across refreshes.

### Phase 3 — Region-aware manifest and browser loading

Status: complete locally

- [x] Add a manifest schema version with multiple named coverage areas and
      simplified boundary polygons.
- [x] Update the generator and browser atomically to manifest schema 2.
- [x] Update the coverage helper to use the areas rather than a single rectangle.
- [x] Keep the current 3×3 zoom-12 initial load, request coalescing,
      deduplication, and 24-chunk LRU.
- [x] Load the point index only for deep links and keep its payload within the
      acceptance budget.
- [x] Test all four UK nations and Ireland as covered, with nearby islands and
      mainland Europe deliberately outside coverage.
- [x] Test missing chunks, partial fetch failures, stale manifests, and selected
      points reached through shared links.

Deliverable: England can be explored without loading national data, while the
app describes its actual boundary correctly.

### Phase 4 — UK-and-Ireland product experience

Status: complete locally

- [x] Expand Nominatim search from the Scotland viewbox to the intended England
      and Scotland coverage while keeping `countrycodes=gb`, submit-only
      requests, and result-boundary filtering.
- [x] Retain Edinburgh as the no-location fallback unless user testing supports
      a different deliberate default.
- [x] Update page metadata, PWA metadata, social preview, descriptions, empty
      states, status messages, and attribution copy to say “England and
      Scotland”.
- [x] Use “UK and Ireland” consistently without implying that the Republic of
      Ireland is part of the UK.
- [x] Keep parking popups focused on the existing useful parking details; input
      region names belong in the report, not as noisy popup labels.
- [x] Update README and contributor documentation for the new sources, refresh
      workflow, resource expectations, and Cloudflare release process.
- [x] Keep the app telemetry-free and document the Nominatim operational risk.

Deliverable: a coherent UK-and-Ireland UI with no leftover Scotland-only
or “prototype” claims in active user-facing copy.

### Phase 5 — Generate and review the combined release

Status: complete locally

- [x] Run the complete data refresh using cached inputs after the first download.
- [x] Review per-region source timestamps, checksums, geometry, discarded
      features, naming tiers, duplicate matches, and completeness.
- [x] Verify record IDs, chunk paths, and point-index path are stable across a second identical
      refresh.
- [x] Confirm all size, file-count, largest-asset, refresh-time, memory, and Git
      churn budgets.
- [x] Inspect dense London chunks, sparse rural chunks, regional borders, and a
      sample of nodes, ways, and relations.
- [x] Verify City of Edinburgh Council OGL and OpenStreetMap ODbL attribution in
      the app and README.
- [x] Pause the release and investigate rather than accepting unexplained count,
      duplicate, or naming changes.

Deliverable: a reproducible combined static dataset and signed-off quality
report suitable for a preview deployment.

### Phase 6 — Application verification and release

Status: local automated verification complete; manual review and deployment pending

- [x] Run focused generator and library tests, then `pnpm test`, `pnpm lint`,
      `pnpm format`, and `pnpm build`.
- [x] Run end-to-end tests against the production-style static export.
- [ ] Browser-test desktop and phone viewports, map movement, zoom, search,
      geolocation granted/denied, deep links, sharing, offline revisit, and PWA
      behavior manually before deployment. Automated coverage is complete.
- [x] Verify representative Scotland locations: Edinburgh, Glasgow, Dundee,
      Aberdeen, Inverness, and Fort William.
- [x] Verify representative England locations: London, Manchester, Birmingham,
      Bristol, Newcastle, Cambridge or Norwich, Cornwall, Cumbria, and a rural
      low-density area.
- [x] Verify representative Wales locations: Cardiff, Swansea, Aberystwyth, and
      Holyhead.
- [x] Verify representative Ireland locations: Belfast, Derry, Dublin, Cork,
      and Galway.
- [x] Confirm Douglas on the Isle of Man is reported as outside the release
      rather than as an empty covered area.
- [ ] Deploy the exact `out/` artifact to a Cloudflare Pages preview and verify
      the manifest, chunks, hashes, headers, caching, and PWA files.
- [ ] Deploy to production and verify `neuk.bike`, `www.neuk.bike`, and
      `neuk-bike.pages.dev` before considering the release complete.
- [ ] Record the previous Cloudflare Pages deployment as the rollback target.

Local deliverable: a verified `out/` artifact ready for manual review. The final
deliverable remains the same artifact live on Cloudflare Pages, with the prior
deployment available for immediate rollback; that work is intentionally gated
on manual sign-off.

### Phase 7 — Optional authoritative overlays

Status: planned after the baseline release

- [ ] Compare Transport for London cycle-parking records with OSM coverage and
      quantify unique or materially better records.
- [ ] Confirm licensing, stable identifiers, update cadence, geometry quality,
      and unattended download reliability before adopting any feed.
- [ ] Generalize overlay precedence and match reporting only when a candidate
      source justifies the maintenance cost.
- [ ] Add local-authority feeds selectively based on measured gaps or user
      reports, not as a prerequisite for England-wide coverage.

Deliverable: evidence-based overlays that improve quality without fragmenting
the baseline refresh workflow.

## Verification matrix

| Area                 | Required evidence                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Data reproducibility | Identical cached inputs produce stable IDs, counts, chunk hashes, and quality totals                       |
| Dense urban data     | London initial payload stays within budget and map interaction remains responsive                          |
| Sparse/rural data    | Empty and low-density chunks load without false errors or national downloads                               |
| Regional boundaries  | All four UK nations and Ireland work; nearby islands and mainland Europe remain outside coverage           |
| Source precedence    | Edinburgh council records suppress only qualifying OSM duplicates, with matches reported                   |
| Naming               | All displayed names use the existing contextual tiers; generic fallback rates are reviewed by region       |
| Search               | UK and Ireland results resolve; outside-coverage results receive accurate feedback                         |
| Location             | User location is respected once; denied/unavailable location falls back to Edinburgh without map snap-back |
| Deep links           | Source-qualified IDs resolve through the on-demand index after a fresh load                                |
| Static hosting       | No Pages Function, database, paid API, or runtime PBF processing is introduced                             |
| Cache behavior       | Manifest revalidates; referenced chunks and framework assets are immutable                                 |
| Deployment           | Provider and custom domains serve the same verified release with valid HTTPS and security headers          |

## Refresh and release runbook target

1. Confirm sufficient local disk space for cached PBF inputs and generated
   output.
2. Run `pnpm update:data` and retain the timing and peak-memory summary.
3. Review every source timestamp/checksum and the per-region quality deltas.
4. Check generated record count, file count, total size, largest asset, manifest,
   point index, initial London payload, and Git churn against the budgets.
5. Run tests, lint, formatting, build, and production-style end-to-end checks.
6. Review representative records and locations from the verification matrix.
7. Deploy the unchanged `out/` directory to a Cloudflare Pages preview.
8. Verify hashes, cache headers, PWA behavior, attribution, and the provider URL.
9. Promote the same artifact to production and verify all live domains.
10. Roll back to the recorded previous Pages deployment if live behavior or
    generated data differs from the signed-off artifact.

Start with a monthly refresh cadence. Change it only after refresh duration,
source stability, quality deltas, and operational effort are understood.

## Effort estimate

Allow approximately three to five focused development days, excluding initial
PBF download time:

- half to one day for benchmarking and the input-strategy decision;
- one to two days for multi-region ingestion, deduplication, naming, and stable
  chunk versioning;
- half to one day for coverage/search and UK-and-Ireland copy;
- one day for generation, quality review, tests, browser verification,
  deployment, and documentation.

The plan intentionally keeps local-authority overlays out of the critical path.
Trying to ship by only swapping the Scotland URL for the 1.6 GB England extract
would be quicker initially, but would leave refresh memory, merge complexity,
boundary accuracy, cache churn, and operational reliability unresolved.
