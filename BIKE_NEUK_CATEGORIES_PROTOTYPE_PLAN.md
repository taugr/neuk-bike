# Bike neuk categories prototype plan

## Status

Implementation and full-region data generation are complete on
`codex/bike-neuk-categories-prototype`, updated on 2026-07-23. The application
and a separate UK-Ireland-Spain POI release passed local validation and were
committed, pushed, and deployed to Cloudflare Pages.

This plan records the selected map-first design: one compact row of category
chips for Parking, Shops, Repair, and Hire; one active category at a time; and
`Nearby bike neuks` retained as the umbrella heading. The large category tiles
and floating map toolbar explored during ideation are intentionally excluded.

Full-region generation, validation, commit, push, and production deployment
were approved on 2026-07-23.

## Implemented prototype scope

- Parking, Shops, Repair, and Hire chips use a single-select control below the
  `Nearby bike neuks` heading.
- Parking stays selected on page load and retains the current full dataset,
  saved-neuk, details, sharing, and directions behavior.
- Non-parking categories lazy-load a separate zoom-12 UK-Ireland-Spain
  OpenStreetMap release with 13,176 unique places in 2,474 chunks: 4,087
  shops, 2,577 repair locations, and 8,006 hire locations. Features with
  explicit overlapping services remain one record, including where county
  extracts overlap.
- Non-parking selections support ranked list/map comparison, opening hours,
  saving to My neuks, and directions. Sharing, Street View, and parking-specific
  facts remain parking-only.
- English, Scottish Gaelic, and Spanish catalogue entries cover the new
  control and loading/empty/error states.

## Product decision

Extend Bike Neuks from a parking-only finder into a small cycling-place finder
without weakening its existing parking experience:

- Keep Parking selected by default on every new page load.
- Add one compact, horizontally laid-out category control below the nearby-list
  heading: Parking, Shops, Repair, and Hire.
- Allow exactly one category to be active, so the map and list never become a
  mixture of unrelated marker types.
- Keep the heading `Nearby bike neuks · {count} closest`; the selected chip
  supplies the specific meaning.
- Keep My neuks available across all categories as one mixed saved list, while
  returning to Parking automatically for a `?parking=` deep link.
- Load shops, repair facilities, and hire locations only after someone selects
  one of those categories.
- Preserve the current mobile sheet, map camera, selection, details, and
  directions interaction model rather than adding another modal, tab system,
  or navigation layer.

## Goals

1. Let someone move from nearby parking to nearby bike services with one tap.
2. Keep the map readable by displaying one category at a time.
3. Reuse the existing Geofabrik inputs and static zoom-12 delivery model.
4. Make OpenStreetMap uncertainty explicit: never infer repair, hire, pumps,
   opening status, or other services from missing tags.
5. Protect saved neuks, parking deep links, parking sharing, and the current
   parking data release from prototype regressions.
6. Validate first with Scotland data, then generate the approved full
   UK-Ireland-Spain release.
7. Preserve English, Scottish Gaelic, and Spanish catalogue parity.

## Non-goals

- Showing several categories simultaneously.
- Adding large category tiles, an advanced-filter modal, or controls over the
  map.
- Adding share links or static social pages for non-parking points.
- Searching by business name; the existing search remains a place/postcode
  origin search.
- Claiming live stock, current opening status, repair availability, prices,
  ratings, or reviews.
- Adding private/commercial place providers, a backend, a database, or live
  Overpass requests.
- Adding broader cycling POIs such as cafés, toilets, pumps without repair
  stations, washes, charging points, or training facilities in this prototype.
- Changing the City of Edinburgh Council parking source or its priority over
  overlapping OSM parking.
- Deploying, committing, or pushing as part of the planning step.

## Current implementation and capacity

- `scripts/update-cycle-parking-data.mjs` currently filters the Geofabrik PBFs
  to `amenity=bicycle_parking`. It reads `shop=*` only as offline naming context;
  shops are not emitted as clickable or searchable features.
- `public/data/parking/` is a schema-v2, content-addressed zoom-12 release with
  a manifest, chunks, and a stable-ID point index.
- `ParkingDataClient` loads a 3-by-3 neighbourhood, responds to viewport
  movement, and keeps a 24-chunk in-memory cache.
- The current release contains 87,611 parking points across 4,342 chunks. Its
  4,344 files occupy 27,965,299 bytes, the manifest is 813,235 bytes, the point
  index is 3,246,441 bytes, and the largest 3-by-3 initial payload is 502,532
  bytes compressed.
- The latest full parking refresh recorded 1,352.1 seconds elapsed and about
  2.36 GB peak RSS. The POI prototype must not assume another full PBF pass is
  cheap.
- The full cycling-place refresh completed in 523.4 seconds with about 0.37 GB
  peak RSS. Its 2,476 assets occupy 3,793,847 bytes; the manifest is 477,572
  bytes, the point index is 488,684 bytes, and the largest 3×3 initial payload
  is 36,638 bytes compressed.
- `cycle-parking-finder.tsx` owns location, nearby/saved list state, selection,
  details, directions, and the mobile sheet. `cycle-parking-map.tsx` owns the
  parking-specific marker and popup presentation.
- `parking-panel.ts` is the canonical list/details/directions state machine.
  Category switching should feed that model, not create a second panel state
  machine.
- The catalogue currently supports English, Scottish Gaelic, and Spanish.
- The existing E2E suite protects list/map selection, My neuks, details,
  directions, map-camera behaviour, sheet sizing, locales, and reduced motion.

## Source proof from the cached Scotland extract

The cached Scotland PBF has an OSM source timestamp of
`2026-07-14T20:20:59.000Z`. A read-only scan using the proposed inclusion rules
found:

| Measure                            | Count |
| ---------------------------------- | ----: |
| Unique non-parking cycling POIs    |   614 |
| Shops                              |   236 |
| Repair                             |   288 |
| Hire                               |   204 |
| Features in more than one category |    94 |
| Features with an explicit `name=*` |   382 |
| Nodes                              |   551 |
| Ways                               |    63 |
| Relations                          |     0 |

These are prototype-sizing observations, not committed dataset counts. Run the
real full extraction before setting final asset budgets or making coverage
claims.

## Data scope and classification

Use one OSM feature once, with a `categories` array because a bike shop may
also explicitly offer repair or hire.

| UI category | Include when                                                      | Do not assume                                                     |
| ----------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| Parking     | Existing parking release                                          | No change                                                         |
| Shops       | `shop=bicycle`                                                    | Repair or hire when their service tags are absent                 |
| Repair      | `amenity=bicycle_repair_station`, or `service:bicycle:repair=yes` | That every bike shop repairs bikes; that every station has a pump |
| Hire        | `amenity=bicycle_rental`, or `service:bicycle:rental=yes`         | Live bike availability; that every bike shop hires bikes          |

The initial rule set deliberately excludes loose matches such as
`shop=sports`, `shop=outdoor`, and `shop=rental` without an explicit bicycle
signal. Keep the predicates in a small pure module with tag-object unit tests
so later additions are reviewed rather than silently widening coverage.

Relevant OSM semantics:

- <https://wiki.openstreetmap.org/wiki/Tag:shop%3Dbicycle>
- <https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dbicycle_repair_station>
- <https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dbicycle_rental>

## Proposed generated-data contract

Keep parking and non-parking POIs separate. Do not add a category discriminator
to every existing parking record or force the stable parking client through a
schema migration for this prototype.

```text
public/data/cycling-pois/manifest.json
public/data/cycling-pois/chunks/12/{x}/{y}.{content-hash}.json
src/data/cycling-poi-report.json
```

No POI point index is required until non-parking deep links exist. Omitting it
keeps the first release smaller and makes that non-goal explicit.

Suggested TypeScript shape:

```ts
type CyclingPoiCategory = 'shop' | 'repair' | 'hire';

type CyclingPoiPoint = {
  categories: CyclingPoiCategory[];
  id: `osm:${'node' | 'way' | 'relation'}:${string}`;
  latitude: number;
  longitude: number;
  name: string;
  properties: {
    brand?: string;
    capacity?: number;
    fee?: string;
    network?: string;
    openingHours?: string;
    operator?: string;
    rental?: string;
    servicePump?: string;
    serviceRepair?: string;
    serviceRental?: string;
    serviceTools?: string;
  };
  sourceId: 'osm';
};
```

Only retain fields that the product may display or use. Preserve explicit
`yes`, `no`, and unknown states rather than converting missing values into
positive claims.

The POI manifest should carry:

- its own schema version;
- zoom level and content-addressed chunk metadata;
- total record count and counts per category;
- counts per category in each chunk, so empty category switches can be
  resolved without guessing;
- the same Geofabrik coverage polygons as the inputs actually processed;
- refreshed-at and source timestamps;
- OSM attribution and ODbL licence metadata.

## Naming contract

Use this deterministic priority:

1. explicit `name=*`;
2. operator, brand, or rental-network name when it identifies the place;
3. category plus nearby street or useful landmark, derived offline;
4. a translated generic fallback such as `Bicycle repair station`.

Generalize only the pure parts of the existing parking naming utilities. Do not
run reverse geocoding in the browser, call a paid naming provider, or expose an
OSM reference as the visible name. The quality report must separate source,
operator/brand, derived, and generic naming tiers and include samples.

## Data pipeline

### 1. Add an independent POI refresh command

- Add `scripts/update-cycling-poi-data.mjs` and a `pnpm update:pois` command.
- Reuse `parking-data-sources.mjs`, cached PBF paths, coverage inputs, tile
  maths, polygon parsing, hashing, representative geometry, and attribution.
- Keep the parking updater unchanged in the first implementation unless a
  focused extraction helper can be shared without changing parking output.
- Support `--regions=scotland --report-only` for a fast source proof that does
  not replace committed output.
- Only the default all-region invocation may replace
  `public/data/cycling-pois/`.
- Generate into a sibling temporary directory, validate it, then rename it
  into place. Never delete the last good POI release before the new one passes
  schema and budget checks.

### 2. Resolve geometry and duplicates

- Support matching OSM nodes, ways, and relations, using representative
  geometry consistent with parking.
- Deduplicate overlapping England-county records by source-qualified OSM ID.
- Merge categories on duplicate IDs rather than emitting the same feature
  several times.
- Report discarded ways/relations with missing geometry and sample their IDs.

### 3. Write a POI quality report

Record:

- total unique features and counts by category;
- category-overlap counts and representative samples;
- nodes, ways, relations, discarded geometry, and duplicate IDs;
- name-tier counts and samples;
- completeness for each retained property;
- source URLs, timestamps, PBF checksums, elapsed time, and peak RSS;
- manifest/chunk counts and byte sizes;
- largest asset and largest compressed 3-by-3 payload.

### 4. Add a fast verifier

- Add `scripts/verify-cycling-poi-data.mjs` and `pnpm verify:pois`.
- Verify schema versions, content hashes, unique IDs, category values, chunk
  counts, coordinates, coverage polygons, source metadata, and report parity.
- Assert that a feature classified by more than one category remains one
  record.
- Fail on a positive service fact that was not supported by its source tags.

## Provisional asset budgets

Use these as merge gates until a full refresh provides real measurements:

- combined parking and cycling-POI output remains below 15,000 files and
  75 MiB;
- POI manifest remains below 1 MiB;
- largest POI asset remains below 20 MiB;
- largest compressed POI 3-by-3 payload remains below 512 KiB;
- the first Parking page load makes no POI request;
- switching between POI categories does not refetch an already cached chunk.

If the real output exceeds a provisional threshold, stop and revise chunking
or fields. Do not add an exclusion merely to force the build through.

## Runtime data loading

### 1. Add a POI client

- Add `src/lib/cycling-poi-data.ts` with strict manifest/chunk validation,
  viewport loading, in-flight request coalescing, and bounded LRU caching.
- Extract shared pure tile, bounds, and coverage helpers from
  `parking-data.ts`; do not rewrite the proven parking cache in the same step.
- Initialize the POI client only on the first Shops, Repair, or Hire selection.
- Store all categories found in a fetched POI chunk together. Filter the loaded
  points in memory by active category.
- Load the active POI category around the current reference location and on
  map viewport changes, matching parking's bounded behaviour.
- Keep category selection in React state only. Default to Parking after a page
  reload and do not add local-storage migration work.

### 2. Define honest loading states

Each non-parking category needs localized states for:

- loading nearby features;
- no matching features in the loaded area;
- retryable manifest/chunk failure;
- current location outside generated coverage.

An empty result means “none found in the loaded data,” not “none exist.” Avoid
copy that implies completeness beyond OSM coverage.

## Interface contract

### Category chips

- Add a focused `NeukCategoryChips` component next to the finder rather than
  embedding another large conditional block in `cycle-parking-finder.tsx`.
- Render the chips directly below the nearby heading and above transient
  loading/status messages and the scrollable results list.
- Use Parking, Shops, Repair, and Hire with existing Lucide icons.
- Use a radiogroup or an equivalent single-select pattern. Every chip exposes
  its selected state programmatically and has at least a 44-pixel touch target.
- Keep the row compact at 390 pixels. If translated labels do not fit, allow
  horizontal scrolling with visible focus and edge padding; never shrink text
  below the existing product scale.
- Hide the chips in My neuks, details, and directions views.

### Heading and saved state

- Keep `Nearby bike neuks · {count} closest` for all nearby categories.
- Count only the active category's ranked list.
- Show the My neuks action only for Parking.
- Opening My neuks, a saved parking record, or `?parking=` switches the active
  category to Parking before applying existing selection state.
- Translate the surrounding heading while preserving `neuks` as a product
  term. Review the resulting Gaelic and Spanish copy rather than copying the
  English word order mechanically.

### Category switching

When a category changes:

1. exit details or directions through the existing panel transition;
2. clear the previous marker/list selection and close its popup;
3. return the nearby list to the top;
4. retain the current reference location and map viewport;
5. load the required POI chunks only when necessary;
6. update the list, numbered markers, heading count, status, and accessible
   labels as one state change;
7. capture a `neuk_category_selected` analytics event with only the category.

Do not persist the chosen category beyond the current page session.

### Lists and facts

- Reuse the current row density, numbered ranking, selection styling, and
  “select, then reveal actions” behaviour.
- Parking rows and their `ParkingDetailStrip` remain unchanged.
- Shops may show distance plus explicitly tagged Repairs and Bike hire facts.
- Repair stations may show distance plus Public tools, Pump, Fee, or Operator
  when supported by tags.
- Hire locations may show distance plus Network, Operator, Capacity, or rental
  type when supported by tags.
- Do not display “Open now” in the prototype. Raw `opening_hours` may be shown
  in details only after deciding on safe formatting; otherwise retain it in the
  generated record and leave it hidden.

### Selection, details, and directions

- Introduce a small shared coordinate-bearing `NeukPoint` base type so
  selection and directions can target parking or POIs without pretending every
  point has parking properties.
- Keep the canonical list/details/directions reducer. Extend its selection
  context with the active category rather than creating independent booleans.
- Preserve current behaviour: list selection previews on the map, a map pin
  opens mobile details, Back returns to the originating category list, and
  Directions returns to the view that launched it.
- Non-parking details contain Back, name, distance, category-specific facts,
  Google Maps, and Directions.
- Omit Save, Share, parking capacity/type/cover, and parking Street View layout
  from non-parking details in the prototype.
- Generalize route state names from parking ID to destination ID only where
  necessary. Keep the CycleStreets request, route rendering, live tracking,
  and parking regression coverage intact.

### Map presentation

- Generalize the sampling helper to coordinate-bearing map points while
  retaining the current zoom limits, selected-point guarantee, and top-eight
  ranked guarantee.
- Continue rendering numbered nearest markers; use Store for Shops, Wrench for
  Repair, and Bike for Hire.
- Use one restrained marker colour family with icon and accessible-name
  differences. Do not introduce four competing colour systems.
- Render only the active category's markers and popup facts.
- Preserve visible-area calculations, mobile-sheet padding, popup centring,
  camera focus rules, keyboard activation, and map-language updates.

### Desktop

- Place the same category chips above the desktop result list, not over the
  map.
- Keep the full-height side panel, search, map controls, and result scrolling.
- Give non-parking desktop popups only truthful facts, Google Maps, and
  Directions. Do not expose parking-specific Save or Share actions.

## Implementation sequence

### Phase 1: source and schema proof

1. Implement pure classification, normalization, category merging, and naming
   helpers with tag-object fixtures.
2. Run the Scotland report-only extraction and review counts, overlap, geometry,
   naming tiers, discarded records, checksum, time, and memory.
3. Freeze schema v1 only after inspecting representative real records from all
   three categories.

### Phase 2: generated POI release

1. Implement content-addressed chunks, coverage, report, atomic replacement,
   budgets, and verification.
2. Generate Scotland output in a non-committing validation path.
3. Run the full cached-region refresh.
4. Inspect real full-output counts and size before committing generated files.

### Phase 3: runtime client and category state

1. Add shared pure spatial helpers and the POI client.
2. Add `CyclingPoiPoint`, category, manifest, and chunk types.
3. Add active-category state with Parking default and lazy POI initialization.
4. Cover caching, viewport loading, switching, empty state, and retry in unit
   tests before UI integration.

### Phase 4: chip-based finder UI

1. Add localized chips and the `Nearby bike neuks` count contract.
2. Keep My neuks visible only for Parking.
3. Render category-specific lists, facts, loading, empty, and error states.
4. Update collapsed-sheet summary and accessible panel labels for the active
   category.

### Phase 5: map, details, and directions

1. Add category markers and POI popups.
2. Generalize selection and destination plumbing while preserving the panel
   reducer.
3. Add non-parking details and directions return behaviour.
4. Verify desktop and mobile behaviour before any full-suite run.

### Phase 6: documentation and release review

1. Update README data-source, refresh, attribution, and generated-data sections.
2. Document `pnpm update:pois` and `pnpm verify:pois`.
3. Record final counts, timestamps, licensing, resource usage, and asset sizes.
4. Review whether the prototype evidence justifies saving or sharing
   non-parking neuks as later work; do not include those features implicitly.

## Verification plan

### Data and unit checks

- classification and multi-category merging from tag fixtures;
- explicit `no`, missing, and malformed service values;
- node, way, and relation geometry plus discarded geometry;
- cross-region OSM-ID deduplication;
- deterministic naming tiers and generic fallbacks;
- content hashes, manifest/report parity, coverage, and budgets;
- POI tile selection, viewport loading, LRU eviction, request coalescing,
  category filtering, empty state, and retry;
- generic map sampling still retains ranked and selected points;
- parking data-client, map-pin, panel, directions, and saved-neuk tests remain
  unchanged and green.

### Focused E2E coverage

Add `e2e/cycling-pois.spec.ts` with deterministic chunk fixtures and at least one
real generated-data smoke test:

1. Parking is selected on first load and makes no POI request.
2. Selecting Shops loads POIs, selects only Shops, updates the count/list/pins,
   and hides My neuks.
3. Selecting Repair and Hire replaces rather than combines results.
4. Switching back to an already loaded POI category reuses its chunks.
5. A multi-category feature appears once in each relevant filtered view.
6. Empty, out-of-coverage, partial-chunk failure, and retry states are honest
   and usable.
7. List and marker selection, details, Back, Directions, and route return stay
   within the originating category.
8. Opening My neuks and a `?parking=` link restores Parking.
9. Search and geolocation changes load the active category around the new
   reference point.
10. Chips fit or scroll accessibly at 390 by 844 and on a narrower phone,
    including Gaelic and Spanish.
11. Keyboard focus, visible focus rings, announcements, reduced motion, and
    collapsed/expanded sheet behaviour remain correct.
12. Desktop chips, list scrolling, popups, and map movement remain usable.

### Required commands

Run the narrowest affected tests while iterating, then:

```bash
pnpm verify:data
pnpm verify:pois
pnpm test
pnpm lint
pnpm format
pnpm build
pnpm test:e2e
```

Use the production static export through
`.agents/skills/manual-test/scripts/serve-static-export.sh` for final browser
review. Verify at minimum:

- 390-by-844 mobile in Parking, Shops, Repair, Hire, details, and directions;
- a narrow mobile viewport and a tall mobile viewport;
- desktop nearby list and popup behaviour;
- Edinburgh with real generated POIs;
- one sparse or empty area;
- English, Scottish Gaelic, and Spanish;
- light and dark themes;
- reduced motion and keyboard-only category selection.

## Completion criteria

The prototype is ready for an implementation review when:

- the only category control is the compact single-select chip row;
- `Nearby bike neuks` remains the visible umbrella term;
- Parking remains the default and its current data, saved, deep-link, sharing,
  details, and directions behaviour passes unchanged;
- Shops, Repair, and Hire are extracted from explicit OSM tags and delivered
  through a separate lazy static release;
- multi-category features are stored once and filter correctly;
- no unsupported repair, hire, pump, live-opening, or availability claim is
  displayed;
- POI list, markers, details, Google Maps, and directions work on mobile and
  desktop;
- full-output counts and asset sizes pass the combined deployment budgets;
- data verification, unit tests, lint, format, static build, focused E2E, and
  full E2E pass;
- README attribution and refresh documentation match the generated release;
  and
- implementation, data generation, verification, commit, push, and deployment
  are reported and approved as separate steps.
