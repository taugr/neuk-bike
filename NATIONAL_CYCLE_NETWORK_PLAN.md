# National Cycle Network map integration plan

Status: implemented and verified locally on 26 July 2026; awaiting manual
review. Nothing has been committed, pushed, or deployed.

## Goal

Add the official UK National Cycle Network as a useful contextual layer in the
existing Bike Neuks map. The finished feature should:

- show the network by default when the user is browsing the UK at a useful map
  zoom;
- distinguish traffic-free, on-road, ferry, link, regional, and temporarily
  closed sections rather than presenting every route as a segregated cycle
  path;
- keep cycle parking, cycling places, and active directions visually and
  interactively dominant;
- work within the current static Next.js export, generated-data, PWA, and
  Cloudflare Pages architecture;
- use the official Walk Wheel Cycle Trust dataset, formerly published under
  the Sustrans name, with complete provenance and attribution;
- avoid live browser queries to ArcGIS and avoid adding a paid API or backend;
- fail independently so network-data problems never prevent parking from
  loading.

The result is a default-on UK map layer inside the existing map-first product,
not a new route planner, a replacement basemap, or a separate network website.

## Evidence snapshot

The figures below were inspected on 26 July 2026 and are planning evidence, not
permanent assertions. The implementation must re-read and report the live
source because the dataset is updated regularly.

- The official
  [National Cycle Network dataset](https://www.arcgis.com/home/item.html?id=5defd254e78745bfb12d0456abc1bcf1)
  is public, licensed under the Open Government Licence v3.0, and described as
  updating every Sunday.
- Walk Wheel Cycle Trust, formerly Sustrans, describes the published layer as
  more than 12,000 miles of signed paths and routes across the UK.
- The live FeatureServer contained 37,209 polyline features.
- Those features comprised 20,291 `TrafficFree` segments, 16,889 `OnRoad`
  segments, 19 ferry segments, and 10 segments without a description.
- Route types comprised 32,214 NCN segments, 3,836 links, 1,145 RCN segments,
  and 14 segments without a route type.
- Open status comprised 37,085 open segments, 98 temporary closures, and 26
  segments without a status.
- The layer exposes useful fields for route/link number, route category,
  traffic-free or on-road classification, greenway status, open status,
  surface, quality, lighting, and road class.
- The service limits a normal query page to 2,000 records. A representative
  2,000-feature GeoJSON page with the intended fields was approximately 1.38
  MB and contained 21,726 vertices. Loading the complete unsimplified layer in
  every browser would therefore create unnecessary startup, parsing, and
  mobile-memory cost.
- The service currently supports GeoJSON and paging and returns WGS84 geometry
  when queried with `outSR=4326`.

Useful source endpoints:

- Dataset item:
  `https://www.arcgis.com/home/item.html?id=5defd254e78745bfb12d0456abc1bcf1`
- Layer schema:
  `https://services5.arcgis.com/1ZHcUS1lwPTg4ms0/arcgis/rest/services/National_Cycle_Network_Public/FeatureServer/0`
- Query endpoint:
  `https://services5.arcgis.com/1ZHcUS1lwPTg4ms0/arcgis/rest/services/National_Cycle_Network_Public/FeatureServer/0/query`

## Product decisions

1. **Official UK source:** use the Walk Wheel Cycle Trust National Cycle
   Network FeatureServer as the primary UK network source. Do not reconstruct
   the UK network from OSM relations for the first release.
2. **Default on, progressively visible:** the preference defaults to enabled,
   but detailed network geometry is hidden below zoom 10. This keeps national
   and multi-country views readable while making the network part of the
   normal town and street map.
3. **User control persists:** add a `National Cycle Network` switch under a
   `Map layers` section in the existing settings menu. Store the preference in
   local storage and contain storage failures. Do not add another permanent
   floating control to the already compact mobile map.
4. **UK-only availability:** show the control and fetch network chunks only
   when the current viewport intersects published network coverage. This
   includes Northern Ireland but excludes the Republic of Ireland, Spain, and
   Armenia. Preserve the saved preference while the control is unavailable.
5. **Accurate language:** call the layer `National Cycle Network` or `Cycle
network`, never `Sustrans cycle paths`. The source contains on-road sections,
   ferries, links, and regional routes as well as traffic-free paths.
6. **Parking remains primary:** parking and cycling-place markers stay above
   the network. Marker selection, map movement, saved neuks, sharing, and
   parking deep links must remain unchanged.
7. **Directions remain primary:** the selected CycleStreets route and approach
   lines stay above the network. Fade the network while directions are active
   rather than hiding useful context completely.
8. **Display does not alter routing:** this feature does not claim that
   CycleStreets follows the National Cycle Network and does not add a `prefer
NCN` routing option.
9. **Static core data:** fetch the source during a deliberate data refresh,
   commit generated assets, and serve only same-origin static files at runtime.
   Do not send user viewports to ArcGIS.
10. **No new dependency by default:** implement the first measured pilot using
    the current Node and MapLibre stack. Add clipping, simplification, vector
    tile, or PMTiles tooling only if the generated-output and browser tests show
    that it is necessary.

## Scope

### Included

- Official National Cycle Network, link, and regional-route segments present
  in the published dataset.
- A reproducible, paginated refresh and normalization script.
- A generated report, content-addressed spatial chunks, and a small manifest.
- Viewport loading, in-memory deduplication, and bounded caching.
- Default-on UK display with a persisted user switch.
- Light- and dark-theme MapLibre line styles, route labels, hit targets, and
  compact details.
- Temporary-closure treatment.
- English, Scottish Gaelic, Spanish, and Armenian interface copy for the new
  controls and details.
- PWA runtime caching, Cloudflare cache headers, provenance, documentation,
  tests, browser QA, and release verification.

### Not included

- Live ArcGIS requests from the browser.
- A backend, database, paid map service, or paid route-network API.
- Replacing the current OpenFreeMap or CARTO basemap.
- Changing CycleStreets route calculation or implying that a returned route is
  an official NCN route.
- OSM-derived signed cycle-route layers for Ireland, Spain, or Armenia.
- Combining official UK geometry with OSM route relations or resolving
  conflicts between those sources.
- The separately published removed-route or reclassified-route datasets.
- Offline pre-caching of the whole UK network. Only previously viewed manifest
  and chunks should be available offline.
- A `parking near the network` filter or build-time proximity analysis. That is
  a valuable follow-up once the overlay is verified.
- Unattended weekly commits or deployments. Refresh automation can be assessed
  after the manual workflow is stable.

## User experience

### Visibility and hierarchy

- If there is no saved preference, network display is enabled.
- Below zoom 10, render no detailed network geometry. The settings switch may
  remain enabled and should explain `Zoom in to see the network` when needed.
- From zoom 10, load only chunks intersecting the visible viewport plus a small
  pan buffer.
- From zoom 10.5, repeat compact NCN, RCN, and link-number shields along the
  loaded line geometry using MapLibre line placement and collision handling.
  Space shields so the number remains useful without labelling every segment.
- Place network line layers above basemap roads and land use but below basemap
  place/street labels where the active style permits.
- Place active direction and approach layers above every network layer.
- Keep DOM parking, cycling-place, start, destination, and live-navigation
  markers above map-rendered network geometry.
- Reduce network opacity while directions mode is active. Restore it without
  reloading data when directions close.

Initial styling semantics, to be refined in both themes:

| Source meaning    | Visual treatment                                              |
| ----------------- | ------------------------------------------------------------- |
| Traffic-free NCN  | strongest solid teal/green line                               |
| On-road NCN       | thinner, lower-contrast indigo/blue line                      |
| Ferry             | dotted traffic-free colour                                    |
| Link              | thinner dashed line and bracketed link number in details      |
| RCN               | visually subordinate line and explicit `Regional route` label |
| Temporary closure | orange/red warning overlay independent of route type          |
| Selected segment  | wider halo without obscuring parking markers                  |

Do not use colour as the only distinction. Solid, dashed, and dotted patterns,
width, opacity, and labels must carry the same meaning.

### Interaction

- Add a wider transparent hit-target layer so mouse and touch selection do not
  require pixel-perfect tapping.
- Tapping a line opens a compact MapLibre popup without changing the parking
  panel view.
- Show only confirmed values. A typical popup may contain a Route 75 shield,
  `National Route 75`, `Traffic-free`, `Asphalt`, `Average`, and `Fully lit`.
- Normalize source enums such as `PavementSlabs`, `MTBOnly`, and `FullLit` at
  build time, then translate both attribute labels and values in every app
  locale. Never show source enum strings directly.
- Use the existing icon-and-fact popup language for route kind, surface, ride
  quality, lighting, and temporary closures. Put route kind first in the facts
  panel; when all four standard facts are present, use a compact 2×2 grid rather
  than a separate subheading plus three-column row. Keep translated text
  alongside every icon.
- Put temporary closure first and give it warning treatment.
- Omit unavailable surface, quality, lighting, greenway, and road-class fields;
  do not convert missing data into `No`.
- Keep the popup concise on mobile. Open it immediately with the same fixed
  bottom anchor as parking-pin popups, then pan only the minimum distance needed
  to reveal content clipped by the map edge, desktop panel, or mobile sheet.
  The fixed anchor must not flip during that pan. Do not recenter a popup that
  is already visible.
- Keep map popups exclusive: opening a network route closes and clears any
  selected parking popup, while opening or selecting a parking pin closes the
  network popup.
- Close or safely re-anchor a network popup when its chunk leaves the viewport,
  the theme changes, or directions take focus.
- Render repeated route shields directly from loaded line properties, allowing
  MapLibre to handle spacing and collisions across the visible segments.

### Settings and persistence

- Add localized `Map layers` and `National Cycle Network` messages.
- Use a versioned boolean preference such as
  `cycle-parking-cycle-network-visible`.
- Default invalid, absent, or inaccessible stored values to enabled without
  blocking the app.
- The switch should use a native checkbox/switch semantic with a visible focus
  state and an accessible description of the low-zoom threshold.
- If analytics are added, record only the enabled/disabled value. Never send
  viewport coordinates, selected route numbers, or segment IDs.

## Generated data design

Create a dataset that is separate from both parking and cycling-place points:

```text
public/data/cycle-network/
  manifest.json
  chunks/10/{x}/{y}.{content-hash}.json
src/data/cycle-network-report.json
```

The initial pilot used zoom 9, but the densest city chunk exceeded the 1 MiB
asset guardrail and its buffered neighbourhood exceeded 1 MiB compressed. The
measured implementation therefore uses zoom 10 and retains those budgets.

### Normalized feature

Use the source `GlobalID` as the stable component of an ID such as
`ncn:<lowercase-global-id>`. Do not use `FID` as the durable identity because it
is a service-maintained object ID. Retain `SegmentID` only as source metadata.

Each normalized feature should contain:

- `id`;
- a GeoJSON `LineString` or `MultiLineString` in `[longitude, latitude]` order;
- `kind`: `traffic-free`, `on-road`, `ferry`, or `unknown`;
- `routeType`: `ncn`, `rcn`, `link`, or `unknown`;
- optional `routeNumber` and `linkNumber`;
- optional `routeCategory`;
- `openStatus`: `open`, `temporary-closure`, or `unknown`;
- optional `greenway`, `surface`, `quality`, `lighting`, and `roadClass`;
- optional `segmentId` for diagnostics.

Normalize known source values explicitly and report every unknown value. Do not
silently pass new enum strings into the interface.

### Chunk schema

Use a focused schema rather than copying the point-chunk type:

```json
{
  "features": [],
  "key": "10/x/y",
  "schemaVersion": 2
}
```

- Assign a feature to every zoom-10 tile intersected by its geometry bounding
  box so cross-tile lines do not disappear at an edge.
- Merge loaded chunks by stable feature ID in the browser to remove expected
  duplication.
- Report the generated duplication ratio. If duplication or a single long
  feature breaks the budgets, clip geometry at tile bounds before considering a
  new runtime format.
- Sort features, properties, and chunks deterministically before hashing and
  writing.

### Manifest and provenance

The manifest should include:

- schema version and chunk zoom;
- source item and FeatureServer URLs;
- source label and publisher;
- retrieval time, item modification time, layer data-edit time, and a checksum
  of the normalized source response;
- record count and counts by kind, route type, route category, and open status;
- published coverage bounds;
- content-addressed chunk paths, bounds, feature counts, and label counts;
- complete attribution and OGL v3 licence URL.

The generated report should additionally include:

- page count and retry information;
- source and normalized geometry-type counts;
- unknown/null field values and representative samples;
- duplicate and missing stable IDs;
- vertex counts before and after any simplification;
- per-chunk and total bytes, gzip estimates, file count, largest asset, and
  maximum buffered viewport payload;
- feature-to-chunk duplication ratio;
- resource usage and elapsed refresh time.

Initial hard guardrails for the pilot are:

- at most 1,000 generated network files;
- at most 50 MiB total uncompressed network data;
- at most 1 MiB for any chunk;
- at most 512 KiB for the manifest;
- at most 1 MiB compressed for the largest supported buffered viewport;
- at most 2.0 generated feature copies per normalized source feature.

These guardrails are deliberately below the established deployment limits.
Tighten them after measuring the first complete output; do not loosen them
silently to make a failing refresh pass.

## Refresh and validation workflow

### Phase 1: Build the source client and normalizer

Add `scripts/update-cycle-network-data.mjs` and focused tests or exported helper
tests that:

- fetch and validate the item/layer metadata before downloading features;
- request only the fields required by the normalized schema;
- use `where=1=1`, deterministic `orderByFields=FID`, `outSR=4326`, and
  `f=geojson`;
- page with `resultOffset` and `resultRecordCount=2000` until the returned
  count matches `returnCountOnly=true`;
- use bounded retries and timeouts and fail with the page/offset in the error;
- handle `LineString` and `MultiLineString` output;
- stage output under `public/data/cycle-network.next` and replace the current
  generated directory only after every validation and budget passes;
- preserve the last good generated dataset after download, schema, or budget
  failures.

Add package commands:

```text
pnpm update:network
pnpm verify:network
```

Keep network refresh separate from `pnpm update:data`. A weekly source update
should not force a full multi-country Geofabrik parking refresh. Document the
recommended manual cadence and the source's Sunday update schedule.

### Phase 2: Generate and audit the static release

Add `scripts/verify-cycle-network-data.mjs` and make both generation and
verification assert:

- valid manifest/chunk schema versions;
- content hashes matching paths;
- stable unique IDs in normalized source data;
- exact agreement between normalized count, report totals, and manifest count;
- valid coordinate ranges and non-empty line geometry;
- recognized kind, route type, status, surface/quality/lighting values;
- every feature discoverable in all expected intersecting tile chunks;
- expected duplication only and correct browser deduplication;
- label candidates reference a known route and stay inside their tile bounds;
- temporary closures remain present and independently styled;
- all asset budgets and Cloudflare file-size constraints pass;
- the source attribution and licence metadata are complete.

Do not encode the 26 July snapshot totals as exact permanent fixtures. Use a
reasonable lower sanity bound and report material changes for human review.
Before accepting a refresh, inspect total counts, the type/status distributions,
unknown values, geometry samples, output sizes, and several named routes in
Great Britain and Northern Ireland.

### Phase 3: Add the browser data client

Add `src/lib/cycle-network-data.ts` with tests, following the useful concepts
from `ParkingDataClient` while keeping a separate schema and cache:

- resolve a base URL correctly at `/` and a configured base path;
- load and validate the manifest;
- determine whether the current viewport has network coverage;
- compute intersecting zoom-10 keys plus a small buffer;
- cap concurrent fetches and keep a bounded LRU of parsed chunks;
- merge and deduplicate loaded features by stable ID;
- ignore stale viewport responses after rapid pans;
- retain cached features while adjacent chunks load so lines do not flicker;
- return an explicit `ready`, `loading`, `unavailable`, or `error` state;
- allow retry without remounting the map or losing parking state.

Start with a maximum of 24 visible/buffer chunks and 48 cached chunks, then
measure realistic mobile and desktop viewports. If a supported viewport needs
more than the visible cap, do not silently omit the farthest route data: adjust
the chunk zoom/buffer or suppress the layer until the viewport is within the
supported detail threshold.

### Phase 4: Integrate MapLibre layers and interaction

Update `src/components/cycle-parking-finder.tsx` to:

- own the network manifest/client, viewport data, state, and saved preference;
- share the existing map viewport callback rather than adding competing map
  listeners;
- fetch no network chunks outside coverage or below zoom 10;
- keep network failures non-blocking;
- add the settings switch and localized availability/zoom/error copy;
- pass normalized visible features, enabled state, and directions state to the
  map.

Update `src/components/cycle-parking-map.tsx` to:

- create one GeoJSON source for network lines, route shields, and hit targets;
- use MapLibre expressions over normalized properties rather than rebuilding a
  source per visual category;
- add visible line, closure overlay, selected halo, transparent hit-target,
  and symbol layers in a stable order;
- insert network geometry below basemap labels when possible and safely fall
  back across both current basemap styles;
- re-add or update sources after light/dark style changes using the existing
  style revision lifecycle;
- keep the CycleStreets and approach sources above the network;
- preserve map viewport, selected parking, and marker DOM during network or
  language changes;
- clean up click, mouse, touch, and popup handlers on style changes/unmount;
- expose minimal semantic map state for Playwright rather than relying on
  sleeps or screenshots alone.

Add focused CSS for the compact popup, legend/switch treatment, warning state,
and mobile wrapping. Do not introduce a landing-page card or a large permanent
legend over the map. The switch description and popup keys can explain the
styles; a compact legend may appear only while the layer is enabled and there
is enough map space.

### Phase 5: Extend localisation, PWA caching, and attribution

Add every new message key to English, Scottish Gaelic, Spanish, and Armenian,
including:

- map layers and network switch;
- zoom-in, unavailable, and temporary-error states;
- traffic-free, on-road, ferry, link, regional route, temporary closure, every
  normalized surface and ride-quality value, and every lighting value;
- route and link number formatting;
- accessible popup close/select and switch descriptions.

Preserve placeholders and catalogue-key parity. Source names, route numbers,
publisher names, licence names, and attribution remain untranslated.

Update `public/sw.js` to treat `/data/cycle-network/` as app data:

- network-first for `manifest.json`;
- cache-first for content-addressed chunks;
- bump the service-worker cache version;
- prove that previously viewed chunks work offline while unseen regions fail
  gracefully without affecting cached parking.

Update `public/_headers` with the same short manifest and immutable chunk cache
semantics as the other generated datasets.

Extend the attribution modal to include the network source only when the
dataset is present. Preserve the official statement covering:

- Walk Wheel Cycle Trust, formerly Sustrans;
- National Cycle Network data under OGL v3.0;
- contained Ordnance Survey Crown copyright/database rights;
- OpenStreetMap contributions in Northern Ireland under ODbL.

Update `README.md` with the new user feature, commands, data flow, update
frequency, offline boundary, attribution, and measured generated-output
figures. Update `CONTRIBUTING.md` if the contributor refresh or verification
workflow changes.

### Phase 6: Test the product behavior

Add unit tests for:

- ArcGIS paging, retries, count agreement, schema drift, and atomic failure;
- normalization of every known source enum and unknown/null values;
- stable IDs and deterministic output;
- line bounding boxes, tile assignment, duplicate merging, label candidates,
  and asset budgets;
- manifest validation, base-path URLs, viewport keys, LRU behavior, stale
  requests, error recovery, and coverage checks;
- preference parsing and storage failures;
- complete translated catalogues and placeholders;
- style-expression helpers and layer ordering where they can be tested without
  a browser.

Add browser coverage for at least:

- Edinburgh: network defaults on, lines appear at zoom 10+, traffic-free and
  on-road features use distinct styles, and parking remains selectable;
- Belfast: official network data loads and confirms Northern Ireland support;
- Dublin, Madrid, and Yerevan: no network chunks are fetched and the UK-only
  control is unavailable without affecting parking;
- low zoom: no detailed source is rendered, then zooming in loads it without a
  page refresh;
- preference: turning the layer off persists across reload and returning to
  the UK;
- directions: the active route remains visually dominant and the network
  fades/restores correctly;
- line popup: route shield, icons, and translated confirmed metadata render in
  a compact responsive fact grid; four standard facts use a 2×2 layout, unknown
  fields are omitted, temporary closure is prominent, and the map pans only
  when the immediately visible popup would otherwise be clipped, without
  changing its anchor;
- popup lifecycle: switching between a network route and parking pin leaves
  exactly one popup visible;
- rapid pan and theme/language changes: no stale geometry, duplicate handlers,
  map remount, or lost viewport;
- network manifest/chunk failure: a non-blocking state appears while parking,
  cycling places, map movement, and directions continue working;
- PWA revisit: viewed chunks work offline and unseen chunks fail gracefully;
- mobile 360/375/390 widths and desktop: controls, labels, popup, attribution,
  and existing sheets remain usable.

Use semantic map/source assertions and console/network checks. Capture light
and dark screenshots at matching desktop/mobile viewports for visual review;
embed those screenshots in the implementation task as required by
`AGENTS.md`.

### Phase 7: Validate, commit, and release as separate gates

Local implementation is complete only after these pass:

```text
pnpm verify:network
pnpm test
pnpm lint
pnpm format
pnpm build
pnpm test:e2e
```

Also inspect the generated report, deployed-file count, largest asset, buffered
payload, `out/` paths, and service-worker behavior. Treat browser console or
network errors as failures even if the build passes.

Keep delivery states explicit:

1. **Planned:** this document only.
2. **Implemented:** source and generated data changed locally.
3. **Verified locally:** data, unit, lint, format, build, browser, offline, and
   visual checks pass.
4. **Committed:** a conventional commit exists.
5. **Pushed:** remote `main` matches the intended commit.
6. **Deployed:** the exact commit's CI and Cloudflare Pages deployment pass.
7. **Verified live:** both `neuk-bike.pages.dev` and `neuk.bike` serve the new
   manifest/chunks and pass UK/outside-UK, theme, directions, attribution, and
   console/network checks.

Do not infer deployment from a successful build or push. Do not infer live
correctness from a successful deployment job.

## Acceptance criteria

The initial National Cycle Network integration is ready when:

- the current official dataset can be refreshed reproducibly with no browser
  dependency on ArcGIS;
- all normalized features have valid geometry and stable IDs, and source schema
  drift fails visibly;
- generated output is deterministic, content-addressed, within budgets, and
  independently verifiable;
- the layer defaults on in eligible UK views, remains hidden below zoom 10, and
  respects a persisted user switch;
- traffic-free, on-road, ferry, link, regional, and temporary-closure meanings
  remain distinguishable without colour alone;
- repeated route shields and icon-led tap details provide useful context
  without overwhelming the parking map;
- parking/cycling-place markers and active directions remain visually and
  functionally dominant;
- Republic of Ireland, Spain, and Armenia fetch no UK network chunks;
- network errors and offline misses never break core parking behavior;
- all four interface languages, keyboard/touch behavior, mobile/desktop
  layouts, light/dark themes, PWA caching, documentation, and attribution are
  verified;
- implementation, local verification, commit, push, deployment, and live
  verification are reported as separate completed states.

## Follow-up opportunities

After the overlay is stable and its data quality is understood, consider
separate plans for:

- a `Parking near the National Cycle Network` filter based on a measured
  build-time distance threshold;
- showing the nearest network route in parking details;
- a generalized low-zoom UK overview if users need national route browsing;
- OSM `route=bicycle` relations as a separately attributed signed-route layer
  outside the UK;
- the official reclassified or removed-route datasets with clear safety and
  status language;
- a scheduled workflow that opens a reviewable data-refresh pull request after
  the source's weekly update.

None of these follow-ups should be folded into the first release without their
own source, licensing, product, payload, and verification decisions.
