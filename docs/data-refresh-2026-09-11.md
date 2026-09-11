# Data refresh review · 11 September 2026

The refresh keeps normalization, merging and naming rules unchanged. All 70
OSM inputs now represent edits through 10 September 2026 (previously 14–23
July). The council feed was retrieved on 11 September; its snapshot does not
provide an underlying edit timestamp. NCN source edits are dated 6 September.

## Parking

The release grows from **87,667 to 88,681 points**: 1,190 added IDs, 176
removed IDs, 300 retained points with changed coordinates, and 2,043 with
changed attributes (1,233 names and 1,138 property objects; these overlap).
These are source differences, not verified physical installations/removals.
The council count stays 1,454. Unique OSM records rise from 87,611 to 88,623;
regional duplicates rise from 216 to 221 and council/OSM matches fall from
1,398 to 1,396. No way or relation geometry was discarded.

| Input group                    | Previous records | Refreshed records |
| ------------------------------ | ---------------: | ----------------: |
| Scotland                       |            5,517 |             5,596 |
| England                        |           57,938 |            58,388 |
| Wales                          |            1,198 |             1,256 |
| Ireland and Northern Ireland   |            4,414 |             4,495 |
| Spain including Canary Islands |           18,704 |            19,054 |
| Armenia                        |               56 |                55 |

Input-group counts precede regional deduplication and council merging.
Armenia's single removed record is OSM node 11676645369 near Tumanyan Street
and Mesrop Mashtots Avenue; absence from this extract does not prove removal
on the ground. Yerevan and Gyumri remain inside the validated coverage.

Capacity completeness stays 83.7%; covered increases 71.0% → 71.6%, access
26.5% → 26.7%, and parking type 84.7% → 85.1%. Names remain 100% complete with
zero generic fallbacks. Naming tiers become 60,273 junction, 14,926 landmark,
10,696 street, 1,765 source and 1,021 place names. Reviewed council samples
retain “Gylemuir Road by Tesco Extra” and the existing street/junction naming.

The 4,417 chunks plus manifest/index total 28,405,533 bytes; the largest asset
is 3,287,026 bytes and maximum initial compressed 3×3 payload is 495,320 bytes.
All content hashes, IDs, counts, coverage and budgets pass the parking verifier.
The temporary refresh initially used Node 25/zlib 1.2.12; its gzip-size metric
was regenerated under project Node 24.14/zlib 1.3.1 before verification. Dataset
bytes were unchanged. The new wrapper keeps generation and verification on
one executable and records the parking asset measurement runtime.

## National Cycle Network

The release changes from **37,209 to 37,206 features**, still in 423 chunks.
The publisher replaced every GlobalID, so treating those IDs as stable would
incorrectly suggest that every route was removed and replaced.

Comparison by the source's segmentId finds 64 added and 67 removed segment IDs.
The one duplicate segmentId (1898, two features in each release) was handled
separately; its content agrees after coordinate rounding. Among 37,140 unique
retained pairs, all coordinates differ at full floating-point precision, but
37,122 pairs have matching vertex counts with every paired vertex within one
metre. Four change vertex count and 14 have a paired displacement above one
metre. Eleven retained segment property objects change. This is substantially
more informative than the net decrease of three records; source segmentation
and identifier changes are not evidence of wholesale network removal.

The refreshed NCN largest asset is 459,093 bytes; the maximum buffered
compressed payload is 570,089 bytes. Its verifier passes schema, source count,
content hashes, feature counts and asset budgets.

## Cycling places

The release grows from **66,960 to 67,948 places** across 8,354 chunks: 1,223
added IDs, 235 removed IDs, 421 retained points with changed coordinates and
433 with changed attributes. Category totals are 4,128 shops, 2,649 repair
locations, 8,044 hire locations and 54,645 drinking-water points; categories
can overlap. Explicit names increase from 23,794 to 23,965 and website coverage
from 5,704 to 5,765. Generic service labels remain appropriate where OSM gives
no name. No way or relation geometry was discarded.
The Cardiff test's former Cycles Direct node is absent from the new extract;
its fixture now checks The Electric Bike Shop (OSM node 11423338326), which
appears in the refreshed nearby list. This updates source expectations while
preserving the loading and layout assertions.

The 8,356 files total 16,447,934 bytes, largest asset 2,528,343 bytes, maximum
initial compressed payload 80,895 bytes. The POI verifier passes. All 70 source
hashes match parking exactly, every source date is 10 September, and retrieval
dates are present. Both full OSM input sets and all seven coverage areas are
complete. The source manifest records the NCN checksum and its 6 September
edit date separately from the 11 September retrieval.

## Validation and release

All three dataset verifiers pass, as do 325 unit tests and three browser
analytics journeys. The full browser run passed 147 cases with one optional
OpenFreeMap smoke test skipped. Its only failure was an ambiguous status
locator; after scoping it to the permission message, all 15 location tests
passed. Together these cover all 148 enabled browser cases.

The Madrid shared-link investigation also reproduced a cache eviction defect:
late viewport loads could displace the active nearby area. That area now stays
in the existing bounded cache, with a regression test covering eviction and
a change of reference location.

Deployment evidence is reported in the task thread; a generated dataset alone
does not establish deployment.
