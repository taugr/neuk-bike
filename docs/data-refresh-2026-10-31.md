# Data refresh review · 31 October 2026

This local refresh replaces the 2 October snapshots. All 70 OSM inputs cover
edits through **29 October 2026 at 21:21:26 UTC**, validated and downloaded from
dated official publications in one invocation. Parking and cycling places use
identical input SHA-256 hashes. NCN source edits are dated
**25 October 2026 at 00:07:02 UTC**. Normalization, naming and merging rules are unchanged.
The date in this review is Asia/Yerevan; acquisition began on 30 October UTC.

| Dataset                | Previous | Refreshed | Added IDs / segments | Removed IDs / segments |
| ---------------------- | -------: | --------: | -------------------: | ---------------------: |
| Parking                |   88,991 |    89,501 |                  580 |                     70 |
| Cycling places         |   68,306 |    68,706 |                  499 |                     99 |
| National Cycle Network |   37,209 |    37,201 |                   64 |                     72 |

These are changes in published data, not verified physical installations or
removals. Parking and POI comparisons use stable OSM/council IDs. NCN features
are deduplicated across chunks by feature ID, then compared by publisher
`segmentId`; ambiguous retained segments (1898)
are excluded from one-to-one geometry/attribute comparisons. The table uses
segment IDs for NCN additions/removals, rather than treating replaced feature
GlobalIDs as a wholesale network replacement.

## Parking

Retained points include 180 coordinate changes, 649 property-object changes and
740 changed names; categories overlap. Council records total 1,454, with 1,401
council/OSM matches. Regional OSM duplicate IDs remain at 221. No way or relation
geometry is discarded. Six council/OSM pairs are newly matched and one previous
pair is no longer matched; these source changes also affect the merged count.
The largest coordinate difference is 171.4 metres at Babraham Road Park & Ride
(`osm:node:11254219521`); the next four largest differences are under 100 metres.

OSM field completeness: name 100%, capacity 83.8%, covered 72.2%, access 26.8%,
parking type 85.3%, cargo-bike designation 0.2% and cargo-bike capacity 0.1%.

Input counts before regional deduplication and council merging:

| Input group                    | Previous | Refreshed |
| ------------------------------ | -------: | --------: |
| Armenia                        |       54 |        54 |
| England                        |   58,556 |    58,812 |
| Ireland and Northern Ireland   |    4,513 |     4,563 |
| Scotland                       |    5,627 |     5,680 |
| Spain including Canary Islands |   19,144 |    19,297 |
| Wales                          |    1,260 |     1,263 |

Naming tiers: 0 generic, 60,841 junction, 15,060 landmark, 1,040 place, 1,766
source and 10,794 street. Council naming samples and changed context names were
reviewed alongside the source counts.

## Cycling places

Retained points include 199 coordinate changes, 259 property-object changes,
59 changed names and 9 category changes; categories overlap. Category totals:
4,129 shops, 2,700 repair facilities, 8,139 hire locations and 55,273 water points.
Categories can overlap. Naming: 24,225 explicit and 44,481 generic category
names. Regional duplicate IDs increase from 472 to 473. No way or relation
geometry is discarded. The largest coordinate difference is 179.4 metres at
Portillo (`osm:node:527840306`); the next four largest are under 100 metres.

## Naming samples

- Parking, `cec:1237`: “St James Crescent by The Alchemist” → “St James Crescent by Starbucks”.
- Parking, `cec:1274`: “Spylaw Road by Rudolf Steiner School” → “Spylaw Road by Edinburgh Steiner School”.
- Parking, `cec:1419`: “Meadowsweet Drive near White Spruce bow” → “Meadowsweet Drive near White Spruce Bow”.
- Cycling places, `osm:node:10698226936`: “Drinking water” → “Font Redona”.
- Cycling places, `osm:node:10756135596`: “Drinking water” → “LNER”.
- Cycling places, `osm:node:10973673973`: “Fuente de la Maílla” → “Drinking water”.

## National Cycle Network

Among 37,135 one-to-one retained segment pairs, 13 property objects and all
37,135 full-precision geometries change. 37,114 retained pairs
have matching vertex counts with every paired vertex displaced less than one
metre; the other 21 change vertex count or exceed that tolerance. The two
features for segment 1898 retain their properties and geometry when rounded
to five decimal places. All publisher feature GlobalIDs were replaced. This
distinguishes identifier and precision changes from larger geometry edits;
it is not a survey of route conditions.

NCN source checksum: `1ea8c58f2550a47f382ece7282050ec10cb969f91f73e596ff49d251556909ec`.

## Assets and provenance

| Dataset        | Files | Total bytes | Largest asset bytes | Maximum initial/buffered compressed bytes |
| -------------- | ----: | ----------: | ------------------: | ----------------------------------------: |
| Parking        | 4,453 |  28,668,698 |           3,318,179 |                                   496,240 |
| Cycling places | 8,442 |  16,650,038 |           2,556,937 |                                    82,186 |
| NCN            |   424 |  30,195,761 |             459,017 |                                   570,391 |

All three staged verifiers pass schema, counts, geometry, coverage, content
hashes and asset budgets. The freshness manifest reports complete source sets,
no mixed-age inputs and matching parking/POI hashes. Full-file receipts match
the pinned publication plan. Generation and verification use Node 24.14.0.
Existing OGL/ODbL attribution is preserved. The previous release remains in
the ignored staging backup.

- Parking: `sha256-5172d9d8895893b57c26b98349e41025c6c9b01c445c5c432d192c75d0c6548a`
- Cycling places: `sha256-923bffa192545a50a8f8bc3c6f4d9e8c62c1e836ecb76668e55786a2bbebd5b2`
- NCN: `sha256-203987401ad6dbb7e045258ca68bee33027f9d7074834eb07d40e2905cf99f35`

See the [weekly review follow-up](weekly-review-action-plan-2026-10-30.md)
for maintenance, measurement, dependency changes and the release boundary.

## Verification

- Installed-release checks pass: `pnpm verify:data`, `pnpm verify:pois`,
  `pnpm verify:network` and `pnpm check:data`. OSM source age is one day and NCN
  source age is five days at the check; all inputs are complete and consistent.
- `pnpm test`: 701 tests pass. `pnpm lint`, `pnpm format` and `git diff --check`
  pass. Documentation links resolve.
- Full `pnpm test:e2e`: 280 pass, two fail and three are skipped. The failures
  are the five-second mesh-render readiness wait and camera-settling wait in
  the close-zoom and Waverley terrain scenarios. The Waverley target records
  are unchanged. Both scenarios pass twice sequentially with traces, without
  code or test changes. Successful traces show camera settling in roughly
  1.3–2.1 seconds. This is consistent with load-sensitive timing, but the
  original parallel run is not a clean pass and the timing limitation remains.
  The skips are the opt-in real OpenFreeMap download and two disabled-wind-build
  scenarios, which require a different build.
- `pnpm test:analytics`: all nine intercepted SDK scenarios pass against the
  final data, including explicit Weather/Wind actions, restored preferences,
  sharing and ride outcomes. No production analytics were sent.
- `pnpm build` passes. The manual-test script verifies that the static preview
  is newer than the build start, and its served freshness JSON exactly matches
  the working tree. The local preview runs on port 4181.

Browser automation is disabled in Work settings, so verification used the
configured Playwright suites. Chromium required execution outside the macOS
sandbox to launch. The data review and preview tabs were queued in Codex.
No commit, push or production deployment was made during this local review.
Publication of these reviewed changes was authorized on 31 October 2026;
deployment verification follows the existing GitHub Actions/Cloudflare workflow.
