# Scotland cycle-parking prototype plan

## Final output

A backend-free Scotland version of Bike Neuks that combines authoritative
Edinburgh council data with OpenStreetMap coverage, publishes a reproducible
static data release, loads only nearby spatial chunks, preserves map-first
mobile behaviour, and can be hosted at no API cost.

The implementation is complete locally. Cloudflare Pages is the recommended
production host, but the external project/DNS cutover is deliberately separate
from this prototype and the existing GitHub Pages deployment remains intact.

## Product decisions

- Scope: Scotland first; source-qualified IDs and the chunk schema can extend
  to the rest of the UK.
- Runtime: static Next.js export with no application server or runtime OSM API.
- Sources: City of Edinburgh Council is preferred in Edinburgh; Geofabrik's
  Scotland OSM extract provides baseline national coverage.
- Cost/privacy: no paid APIs, accounts, database, or personal-location storage.
- Hosting: prepare the output for Cloudflare Pages edge caching, while retaining
  GitHub Pages until a verified custom-domain cutover.
- Sharing: stable query links and a point index replace per-record HTML/SVG
  generation; the general site preview is used for all stands.

## Measured acceptance budgets

| Measure                 |              Baseline |           Scotland result | Budget / decision                                            |
| ----------------------- | --------------------: | ------------------------: | ------------------------------------------------------------ |
| Parking records         |                 1,462 |              5,573 merged | National coverage accepted as a prototype, not authoritative |
| Static point pages      |           2,924 files |                         0 | Per-point generation removed                                 |
| Static export           |                 16 MB |              about 5–6 MB | Under 10 MB target                                           |
| Parking data release    | one 616 KB eager file |   3.2 MB across 518 files | Loaded by location, never as one client bundle               |
| Manifest                |                   n/a |  about 92 KB uncompressed | Under 100 KB target                                          |
| Largest chunk           |                   n/a | about 292 KB uncompressed | Under 500 KB target                                          |
| Initial chunk selection |           all records |   at most 3×3 local tiles | Nine-tile target                                             |
| In-memory cache         |           all records |              24-chunk LRU | Bounded cache target                                         |
| Static build            |     about 6.9 seconds |   about 6 seconds locally | Under 30 seconds target                                      |

Representative browser locations: Edinburgh, Glasgow, Dundee, Aberdeen,
Inverness, Fort William, and London as the outside-Scotland case.

## Architecture delivered

```text
Council GeoJSON ----\
                   -> normalize -> deterministic merge -> z12 chunks -> static export
OSM Scotland PBF ---/                        |              |              |
                                      quality report     manifest      browser LRU
                                                            |
                                                       point index
```

Generated contract:

```text
public/data/parking/manifest.json
public/data/parking/{version}/12/{x}/{y}.json
public/data/parking/{version}/point-index.json
src/data/cycle-parking-report.json
```

## Phases

### Phase 0 — Baseline and thresholds

Status: complete

- [x] Measure the Edinburgh bundle, build, export, and record baseline.
- [x] Define manifest, chunk, cache, build, and export budgets.
- [x] Record national and outside-boundary browser locations.
- [x] Choose plain wording for community-mapped records and partial coverage.

### Phase 1 — Reproducible OSM ingestion

Status: complete

- [x] Download/cache the official Geofabrik Scotland PBF during maintenance.
- [x] Extract bicycle-parking nodes, ways, and relations.
- [x] Generate safe representative points for non-node geometry.
- [x] Normalize capacity, cover, access, fee, operator, and parking type.
- [x] Record source timestamp and SHA-256 checksum.
- [x] Generate geometry, completeness, and discarded-feature reporting.

Current evidence: 5,517 OSM candidates comprised 5,206 nodes, 309 ways, and 2
relations; 5,573 points remain after the council merge.

### Phase 2 — Merge, provenance, and quality

Status: complete

- [x] Add point-level source IDs and a source catalogue.
- [x] Use deterministic council priority for likely Edinburgh duplicates.
- [x] Require a distance/attribute rule rather than one broad radius.
- [x] Record every council/OSM match in the generated report.
- [x] Derive useful offline names from source names, junctions, landmarks,
      streets, and settlements, with an auditable naming tier per point.
- [x] Add tests for IDs, normalization, matching, priority, tiling, and geometry.
- [x] Render both active sources and licence links in the app.

Current evidence: 1,398 OSM candidates are suppressed in favour of council
records, with IDs and match distances retained in the report. All 5,573 merged
points now have a contextual display name; the report records the naming tier
counts and review samples.

### Phase 3 — Spatial chunks and browser store

Status: complete

- [x] Generate versioned zoom-12 chunks, a manifest, and point index.
- [x] Remove the eager Scotland data import from the client bundle.
- [x] Load the current tile plus one-tile buffer and react to map movement.
- [x] Deduplicate points, coalesce concurrent requests, and use a 24-chunk LRU.
- [x] Surface loading and fetch failures without dropping loaded points.
- [x] Resolve source-qualified and legacy Edinburgh deep links.
- [x] Test tile selection, request deduplication, coverage, and deep-link loading.

### Phase 4 — Scotland UX and resilience

Status: complete

- [x] Replace Edinburgh-only search, fallback, metadata, and status copy.
- [x] Use Stirling as the deliberate Scotland-centred fallback.
- [x] Keep popups focused on parking details while retaining full source and
      licence attribution in the Attributions view.
- [x] Cache visited versioned chunks in the service worker.
- [x] Verify desktop/mobile flows and national test locations.
- [x] Explain the outside-Scotland fallback rather than implying no coverage.

### Phase 5 — Static export and sharing

Status: complete

- [x] Remove per-point HTML and SVG generation.
- [x] Preserve `?parking=` links with an on-demand point index.
- [x] Use the general site social preview for prototype parking links.
- [x] Re-measure output and build performance.
- [x] Add immutable cache policy for versioned chunks and framework assets.
- [x] Document GitHub Pages continuity and the Cloudflare Pages migration.

### Phase 6 — Validation and refresh operation

Status: complete locally

- [x] Make `pnpm update:data` the complete validated refresh command.
- [x] Run focused tests, type checking, lint, formatting, and static build.
- [x] Run static-export browser checks on desktop and phone viewports.
- [x] Test Edinburgh, Glasgow, Dundee, Aberdeen, Inverness, Fort William, and an
      outside-Scotland location.
- [x] Review source URLs and in-app OGL/ODbL attribution.
- [x] Document a monthly initial data-refresh cadence.

External release follow-up:

- [x] Create the Cloudflare Pages project with Wrangler Direct Upload.
- [x] Verify the `pages.dev` preview, headers, caching, PWA, and environment
      variables.
- [ ] Attach `neuk.bike`, move DNS, and verify HTTPS before disabling GitHub
      Pages.

Release evidence (2026-07-16): the Scotland prototype is live at
[`neuk-bike.pages.dev`](https://neuk-bike.pages.dev/). The published manifest
and sample chunk match the local build hashes; the manifest uses a five-minute
revalidation policy, while the versioned point index, chunks, and framework
assets are immutable. The PWA manifest, service worker, security headers,
public build-time integrations, contextual names, popup details, and manual map
zoom behavior were verified on the deployed site.

## Refresh and release runbook

1. Run `pnpm update:data` and review the console totals.
2. Inspect `src/data/cycle-parking-report.json` for source timestamp, checksum,
   geometry changes, discarded features, completeness, and unusual duplicate
   changes.
3. Run `pnpm test`, `pnpm lint`, `pnpm format`, and `pnpm build`.
4. Run `pnpm test:e2e` against the built static export.
5. Check the attributions and at least one council and one OSM record.
6. Publish the unchanged `out/` artifact. Refresh monthly at first, and pause a
   release when source shape, counts, or duplicate rates move unexpectedly.

## Future UK expansion

Add separate England, Wales, and Northern Ireland maintenance inputs that emit
the same normalized point, source catalogue, chunk, manifest, and index schema.
Local-authority feeds remain optional quality overlays. Before expanding,
evaluate Scotland refresh reliability, coverage feedback, static file counts,
and unresolved licence or attribution issues.
