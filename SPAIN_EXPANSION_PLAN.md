# Spain Dataset Expansion Plan

Status: implemented and verified locally, review-ready, not deployed
Estimate date: 2026-07-17

## Recommendation

Add Spain as an OpenStreetMap-first extension of the existing static spatial
dataset. The current chunk format, browser loader, offline cache, and Cloudflare
Pages deployment can support it without an architectural change or a paid
Cloudflare plan.

The first release supports finding, searching, selecting, sharing,
offline-revisiting, and routing to Spanish parking. A live Madrid probe using
the configured CycleStreets API returned a valid route, so the existing
directions experience remains enabled across the expanded coverage.

Do not add Spanish local-authority feeds in the first release. Use the same OSM
baseline as the rest of the national dataset, then evaluate local feeds only
when they have clear coverage or attribute benefits.

## Scope

Spain means all Spanish territories represented by these two Geofabrik
coverage areas:

- the main Spain extract, including the mainland, Balearic Islands, Ceuta, and
  Melilla;
- the separately published Canary Islands extract.

The main [Geofabrik Spain extract](https://download.geofabrik.de/europe/spain.html)
explicitly excludes the Canaries. The
[Canary Islands extract](https://download.geofabrik.de/africa/canary-islands.html)
must therefore be a separate input and coverage polygon.

## Measured size estimate

This estimate uses the generated release currently in the repository plus an
OSM coordinate snapshot queried on 2026-07-17. Regional Taginfo reported 18,488
`amenity=bicycle_parking` features in the main Spain extract and 205 in the
Canary Islands. A coordinate query returned 18,691 usable features and 1,127
occupied zoom-12 chunks. The production refresh may move these values slightly
as OSM changes and as invalid geometries are discarded.

| Metric                   |   Current | Spain addition | Projected total |
| ------------------------ | --------: | -------------: | --------------: |
| Parking records          |    68,916 |         18,695 |          87,611 |
| Parking chunks           |     3,213 |          1,129 |           4,342 |
| Parking files            |     3,215 |          1,129 |           4,344 |
| Parking data             | 20.65 MiB |       6.02 MiB |       26.67 MiB |
| Full static export files |     3,257 |          1,129 |           4,386 |
| Full static export       | 22.98 MiB |       6.02 MiB |       29.00 MiB |
| Manifest                 |  0.57 MiB |       0.21 MiB |        0.78 MiB |
| Point index              |  2.43 MiB |       0.67 MiB |        3.10 MiB |

The original projection normalized queried Spanish tags with the current
schema and assigned the exact zoom-12 chunk keys. The full production refresh
confirmed it within a few tenths of a MiB.

The source-side cost is larger than the shipped data:

- the current Geofabrik Spain PBF is about 1.4 GB;
- the Canary Islands PBF is about 56 MB;
- using Spain's autonomous-community extracts plus the Canaries adds about
  1.46 GB to the ignored local cache, taking it from about 2.4 GB to about
  3.9 GB;
- the completed UK, Ireland, and Spain refresh took 22.5 minutes including the
  first Spanish downloads, with a 2.20 GiB peak RSS.

Use the autonomous-community PBFs sequentially instead of the monolithic Spain
PBF. This matches the existing England strategy, bounds peak memory, provides
better progress reporting, and lets the existing source-ID deduplication handle
any boundary overlap. The production browser never downloads these PBFs.

## Cloudflare free-tier assessment

Cloudflare Pages currently permits 20,000 files on Free and a maximum static
asset size of 25 MiB. Static asset requests are free and unlimited when they do
not invoke a Pages Function.

The projected release is comfortably inside those limits:

| Limit                   |            Projected use |       Headroom |
| ----------------------- | -----------------------: | -------------: |
| Pages files             |          4,386 of 20,000 | about 78% free |
| Largest asset           | about 3.10 MiB of 25 MiB | about 88% free |
| Pages Function requests |                     none | not applicable |

The app is a pure static export, so Spanish chunk requests do not consume the
Workers Free request allowance. There is no Cloudflare bandwidth or static
asset request charge to absorb. The current GitHub Actions production run takes
about 94 seconds end-to-end, including a roughly 10-second Pages upload; another
1,127 small files is not close to the workflow's 20-minute deployment timeout.

The repo's stricter generated-data budgets also remain green in projection:

| Repository budget               |                                        Projected use |
| ------------------------------- | ---------------------------------------------------: |
| Parking data                    |                            about 26.41 MiB of 75 MiB |
| Parking files                   |                                      4,344 of 15,000 |
| Largest generated parking asset |                             about 3.10 MiB of 20 MiB |
| Manifest                        |                              about 0.78 MiB of 1 MiB |
| Point index                     |                              about 3.10 MiB of 5 MiB |
| Worst initial 3x3 payload       | expected to remain about 0.5 MiB of 1 MiB compressed |

The manifest is the nearest internal threshold at about 78%. Spain fits, but a
later large-country expansion should stop embedding every chunk and full
coverage polygon in one manifest, or should raise that internal budget only
after measuring startup transfer and parse time.

## Product constraints outside Cloudflare

Cloudflare is not the limiting service. The two external runtime integrations
need explicit handling:

1. **Place search:** update Nominatim from `gb,ie` to `gb,ie,es`, enlarge the
   bounded viewbox to include the Canaries, and retain submit-only search plus
   the existing client cache. Public Nominatim has an application-wide maximum
   of one request per second and permits only moderate end-user-triggered use.
   Spain does not immediately break this model, but traffic should be monitored.
2. **Directions:** the configured CycleStreets API returned a valid Madrid
   route during implementation. Spanish directions remain on the existing code
   path and are covered by a local short-route browser test.

The map styles themselves are global and need no Spain-specific data change.

## Implementation phases

### Phase 0: Confirm the product boundary (1-2 hours)

- Confirm that "Spain" includes the Canary Islands, Balearics, Ceuta, and
  Melilla.
- Probe the existing CycleStreets API with short Madrid and Barcelona routes.
- Adopt the default launch decision: Spanish parking discovery is in scope;
  Spanish directions are enabled only if validated.
- Keep the UI in English for this expansion. Spanish localization is separate.

Exit gate: a recorded directions decision and no ambiguous Spanish territory
scope.

### Phase 1: Add memory-bounded source coverage (2-4 hours)

- Add Spain's autonomous-community PBFs to
  `scripts/parking-data-sources.mjs` with a shared `spain` country ID.
- Add the separate Canary Islands PBF under the same country ID.
- Add the main Spain and Canary Islands `.poly` files as separate coverage
  areas.
- Generalize source catalogue links and progress/report labels where they still
  assume UK and Ireland.
- Preserve source-qualified OSM IDs and the existing cross-region
  deduplication.

Exit gate: a Spain-only refresh can be selected, both coverage polygons parse,
and no UK or Ireland behavior has changed.

### Phase 2: Generate and audit the combined release (3-5 active hours)

- Run the complete refresh from cached inputs and regenerate the snapshot,
  report, manifest, chunks, and point index.
- Inspect record and geometry counts, discarded ways/relations, duplicate IDs,
  source timestamps, hashes, peak RSS, elapsed time, and all asset budgets.
- Review name tiers and samples in Madrid, Barcelona, Valencia, Seville,
  Zaragoza, Bilbao, Palma, Las Palmas, Ceuta, and Melilla. Preserve accents and
  source names.
- Investigate any city tile that approaches the current largest-chunk or
  initial-payload limits.

Exit gate: `pnpm verify:data` passes and the measured release stays below every
hard budget without weakening one.

### Phase 3: Generalize runtime coverage and copy (3-5 hours)

- Update Nominatim country codes and the bounded search viewbox.
- Replace hard-coded "UK and Ireland" strings in the UI, app metadata, web
  manifest, social preview, README, and tests.
- Keep coverage acceptance polygon-based so Portugal, France, Andorra, and
  Morocco remain outside despite the larger bounding rectangle.
- Make Spanish geolocation, place search, chunk loading, direct links, sharing,
  PWA caching, and fallback behavior use the same existing code paths.
- Gate the directions action according to the Phase 0 decision.

Exit gate: a Spanish user can arrive by geolocation or search, see local
parking, select and share it, and receive truthful directions behavior.

### Phase 4: Verify and ship (4-6 hours)

- Extend unit tests for `gb,ie,es` search, Spain and Canary coverage, and nearby
  out-of-coverage locations.
- Extend data verification with Madrid, Barcelona, Seville, Palma, Las Palmas,
  Ceuta, and Melilla as inside points and Lisbon, Paris, Andorra la Vella, and
  Tangier as outside points.
- Add E2E coverage for mocked GPS in mainland Spain and the Canaries, Spanish
  search, a Spanish deep link, mobile loading, and directions gating.
- Run `pnpm test`, `pnpm lint`, `pnpm format`, `pnpm verify:data`,
  `pnpm build`, and the relevant E2E suite.
- Deploy a preview, inspect network payloads and caching, then deploy `main` and
  verify both `neuk.bike` and `neuk-bike.pages.dev`.

Exit gate: the generated report contains the expected Spanish coverage, the
static export stays within budgets, and both production URLs load Spanish
parking without UK or Ireland regressions.

## Effort summary

| Delivery level                  |              Estimate | Result                                                                                |
| ------------------------------- | --------------------: | ------------------------------------------------------------------------------------- |
| Data files only                 |       about 0.5-1 day | Spanish chunks exist, but search, copy, tests, and directions behavior are incomplete |
| Recommended shippable expansion | about 2 days, allow 3 | Complete discovery/search/share flow with truthful directions gating                  |
| International directions parity |    add about 2-4 days | Provider evaluation and integration; free operation is not assumed                    |

## Go/no-go thresholds

Stop and redesign before deployment if the generated release exceeds any of
these:

- 15,000 parking files or 20,000 total Pages files;
- 75 MiB total parking data;
- 20 MiB for any generated parking asset or 25 MiB for any Pages asset;
- 1 MiB raw manifest or 5 MiB point index;
- 1 MiB compressed for the worst initial 3x3 chunk neighbourhood;
- materially worse browser startup, map movement, or mobile memory behavior;
- unhandled Spanish directions failures presented as normal route support.

Based on the measured projection, none of these thresholds is close enough to
block Spain. The manifest threshold is the one to watch for the country after
Spain.
