# Data refresh review · 25 September 2026

All 70 OSM inputs represent edits through **24 September 2026 at 20:21:20 UTC**,
replacing 10 September inputs. Parking and cycling places use identical input
SHA-256 hashes. NCN source edits are dated 20 September at 00:06:52 UTC.
Council data was retrieved again; its 1,454 records are unchanged in count.
The source refresh leaves normalization, naming and merging rules unchanged.

| Dataset                | Previous | Refreshed | Added IDs | Removed IDs |
| ---------------------- | -------: | --------: | --------: | ----------: |
| Parking                |   88,681 |    88,879 |       246 |          48 |
| Cycling places         |   67,948 |    68,229 |       325 |          44 |
| National Cycle Network |   37,206 |    37,207 |        65 |          64 |

These are differences in published data, not verified physical installations
or removals. Parking/POI comparisons use stable OSM/council IDs. NCN comparisons
first remove chunk-boundary copies by feature ID, then match `segmentId`;
the publisher replaced its GlobalIDs again. Segment 1898 has two distinct
features and is excluded from one-to-one geometry/attribute comparisons.

## Parking

Retained points include 73 coordinate changes, 236 property-object changes,
and 416 changed names; these categories overlap. Council/OSM matches stay at
1,396, regional OSM duplicate IDs at 221, and unique OSM records rise to 88,821.
No way or relation geometry is discarded. Capacity completeness remains
83.7%, covered rises to 71.7%, access remains 26.7%, and parking type 85.1%.
Names remain 100% complete with no generic fallback.

| Input group, before deduplication/merging | Previous | Refreshed |
| ----------------------------------------- | -------: | --------: |
| Scotland                                  |    5,596 |     5,614 |
| England                                   |   58,388 |    58,505 |
| Wales                                     |    1,256 |     1,257 |
| Ireland and Northern Ireland              |    4,495 |     4,507 |
| Spain including Canary Islands            |   19,054 |    19,105 |
| Armenia                                   |       55 |        54 |

Armenia's removed point is OSM node 12215500041 near Mesrop Mashtots Avenue
and Tumanyan Street. Its absence from the extract is not evidence of a
physical removal. Coverage remains complete.

Naming tiers: 60,406 junction, 14,959 landmark, 10,726 street, 1,764 source,
and 1,024 place. Council samples retain “Gylemuir Road by Tesco Extra” and
“Belhaven Terrace near Cluny Gardens.” Changed source-context samples include
“The Maltings by Aldi” becoming “The Maltings by Petstop.”

Parking uses 4,426 chunks and 28,469,044 bytes including manifest/index.
The largest asset is 3,294,574 bytes and the maximum initial compressed
3×3 payload is 495,891 bytes, within the existing budgets.

## Cycling places

Retained points include 101 coordinate changes, 64 property-object changes,
and 36 name changes. The release has 4,131 shops, 2,667 repair facilities,
8,059 hire locations and 54,897 water points; categories can overlap.
There are 24,036 explicit names and 44,193 generic category names. No way or
relation geometry is discarded; 472 regional duplicate IDs are removed.
A naming sample changes “Fonte da Chainza” to “Fonte da Chaínza.”

The 8,395 chunks plus manifest/index total 16,517,495 bytes. The largest asset
is 2,538,934 bytes and maximum initial compressed payload is 81,027 bytes.

## National Cycle Network

There are 65 added and 64 removed segment IDs. Of 37,140 one-to-one retained
pairs, all differ at full floating-point precision, but 37,119 have matching
vertex counts with every paired vertex displaced less than one metre.
The two features for segment 1898 retain their properties and geometry when
rounded to five decimal places. The other 21 one-to-one pairs change vertex
count or exceed the one-metre tolerance. Six retained
property objects change. This avoids misrepresenting source ID and precision
churn as a wholesale network replacement.

The 423 chunks contain 38,274 feature copies for map-boundary coverage,
representing 37,207 distinct features. Total assets are 30,196,694 bytes;
the largest asset is 459,116 bytes and maximum buffered compressed payload
is 569,885 bytes. Source checksum:
`6841c9ea47eadb95a0c79971d253aab55d0d49d36485cf3fce8b87761022037c`.

## Release integrity

All three verifiers pass counts, geometry, coverage, schema, asset budgets,
and content hashes. The freshness manifest reports complete source sets,
no mixed-age inputs, and matching parking/POI hashes. Generation and verification
both use project Node 24.14.0.

The browser suite passed 157 scenarios initially. Its one failure assumed
Edinburgh had no cargo-bike-tagged parking; the refresh adds node 14190224108
on East Claremont Street with `cargo_bike=designated`. The unknown-details UI
test now explicitly removes cargo tags in its intercepted fixture and passes
its focused rerun. This preserves the fallback assertion without removing or
ignoring the new real-world record. Across the run and corrected scenario,
158 desktop/mobile scenarios pass, with one optional scenario skipped.
The eight analytics scenarios and 331 unit tests also pass.

- Parking: `sha256-3f55b2725d9043512e70190f2769570d9ae2253b03df432d9d82a30c038f8bbd`
- Cycling places: `sha256-1d9cffa70600de2e5751f9e411af94245870f3bdcf0df4b953e98c3a59741af8`
- NCN: `sha256-c7e98b6762ce94e30f327550334905809b9218f5cf17865f404cfb93e2cbe98a`

The existing OGL/ODbL attribution is preserved. The previous release remains
in the ignored local staging backup; generated files are committed only after
review. See the [maintenance follow-up](weekly-review-action-plan-2026-09-25.md)
for analytics coverage, dependency fixes and the next-sprint recommendation.
