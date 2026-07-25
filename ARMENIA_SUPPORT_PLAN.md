# Armenia support plan

Status: implemented and technically verified locally; awaiting user and
native-language review. No commit, push, or deployment has been performed.

## Goal

Add Armenia as a first-class Bike Neuks coverage area using the same static,
backend-free architecture as the UK, Ireland, and Spain. The finished release
should:

- load Armenian OpenStreetMap cycle parking, bicycle shops, repair facilities,
  and hire locations from a Geofabrik extract;
- accept Armenian geolocation, place-search results, saved links, and map
  movement without falling back to Edinburgh;
- provide a complete Armenian (`hy`) interface alongside English, Scottish
  Gaelic, and Spanish;
- preserve Armenian-script source names and render them correctly on desktop
  and mobile;
- make directions behavior honest and usable if CycleStreets does not cover
  Armenia;
- retain the current generated-chunk, offline-cache, attribution, privacy, and
  Cloudflare Pages model.

The result is Armenia support in the existing map-first product, not a separate
Armenian landing page or a second deployment.

## Evidence and expected impact

The evidence below is a planning snapshot from 25 July 2026. It must be
re-measured from the downloaded PBF during implementation because OpenStreetMap
changes continuously.

- Geofabrik publishes
  [`asia/armenia-latest.osm.pbf`](https://download.geofabrik.de/asia/armenia.html)
  and `asia/armenia.poly` under the same OSM/ODbL terms as the current inputs.
- The inspected PBF was 50.3 MiB with an OSM source timestamp of
  `2026-07-23T20:22:05Z`.
- The repository's current filters found 56 `amenity=bicycle_parking` nodes in
  seven zoom-12 chunks.
- The cycling-place filters found 36 distinct POIs in 12 zoom-12 chunks:
  28 shops, 13 repair locations, and 7 hire locations. Category totals overlap.
- With the current generated releases as the baseline, the expected totals are
  approximately 87,667 parking records in 4,349 chunks and 13,212 cycling POIs
  in 2,486 chunks.
- The added source cache and generated files are small relative to the current
  hard budgets. Capacity is not the project risk; translation quality,
  provider behavior, sparse mapping, and regression coverage are.
- A live Photon probe successfully returned `Երևան` when using
  `countrycode=AM` and `lang=default`. Photon rejected `lang=hy` and reported
  that only `default`, `de`, `en`, and `fr` are supported.
- A live CycleStreets balanced-route request in Yerevan returned a valid
  1,612-metre route with 72 geometry points and Armenian street instructions.
  Directions therefore remain enabled for Armenia, with the existing Google
  Maps action as an alternative.

Useful, snapshot-specific acceptance fixtures include:

| Purpose                    | Stable OSM ID          | Coordinates or name                   |
| -------------------------- | ---------------------- | ------------------------------------- |
| Yerevan parking            | `osm:node:4338270190`  | `40.1881056, 44.5167068`, capacity 12 |
| Gyumri parking             | `osm:node:6421569686`  | `40.7869518, 43.8381560`              |
| Armenian-script shop       | `osm:node:4201765290`  | `ՄայԲայք`                             |
| Multi-category Yerevan POI | `osm:node:12814921894` | `VELOGUROO`, shop/repair/hire         |
| Regional hire POI          | `osm:node:11396670636` | `COAF Debed Canyon VC Bike Rental`    |

Fixtures should be confirmed after the implementation refresh. Tests should
not encode the snapshot totals as permanent minimums.

## Scope boundaries

### Included

- Armenia Geofabrik PBF and coverage polygon inputs.
- Parking and cycling-POI generated releases.
- Armenian interface translation and locale selection.
- Armenian and Latin-script Armenian place search.
- Armenia coverage, map, geolocation, deep-link, sharing, saved-neuk, category,
  and offline behavior.
- Explicit Armenia directions behavior.
- User-facing metadata, documentation, attribution, and QA updates.

### Not included

- Runtime Overpass queries or a server/database.
- Paid data or routing APIs.
- Importing an unverified municipal or commercial Armenian dataset.
- Translating source-authored OSM names, brands, operator names, legal text, or
  attribution.
- Per-locale routes, translated social pages, or a separate Armenian hostname.
- General cycling-infrastructure or route-network layers. The existing product
  continues to publish parking and the three cycling-place categories only.
- Replacing Edinburgh Council data or changing its precedence within Edinburgh.
- Automatically introducing a new routing provider. That would need a separate
  technical, privacy, licensing, quota, and product decision if required.

## Product decisions to retain

1. **Static ingestion:** download Geofabrik at refresh time, process it
   sequentially, and serve versioned zoom-12 assets. Do not query OSM from the
   browser.
2. **One Armenia source:** use the national Armenia PBF and national polygon;
   there is no need to split this small extract into provinces.
3. **OSM as the baseline:** ship the mapped coverage honestly rather than
   delaying for speculative local feeds. Local Armenian sources can be assessed
   later if they have clear ownership, freshness, licensing, and added value.
4. **Source names stay intact:** preserve Armenian and other source-authored
   names. Translate only interface copy and generated naming templates.
5. **Armenian locale:** use locale key `hy`, self-name `Հայերեն`, formatting
   locale `hy-AM`, and Photon language `default`.
6. **Left-to-right layout:** Armenian is left-to-right, so no RTL architecture
   is needed. It still requires glyph, wrapping, truncation, and small-screen
   testing.
7. **Directions are verified:** retain the existing CycleStreets action in
   Armenia because a live Yerevan route returned valid geometry and
   instructions. Keep the existing error handling and external-map alternative
   for provider failures.
8. **Fallback remains predictable:** denied/unavailable geolocation may still
   fall back to Edinburgh. A valid point inside the Armenia polygon must never
   be classified as outside coverage.

## Implementation plan

### Phase 1: Add Armenia to the source catalogue

Update `scripts/parking-data-sources.mjs`:

- add a Geofabrik Asia root;
- add one `osmInputs` entry with `countryId: 'armenia'`, `id: 'armenia'`, label
  `Armenia`, and the national PBF URL;
- add the Armenia `.poly` file to `coverageInputs`;
- change the shared coverage label to `UK, Ireland, Spain and Armenia`.

Keep Armenia in the shared catalogue so both `pnpm update:data` and
`pnpm update:pois` consume exactly the same source definition.

Update both verification scripts:

- derive or compare the parking coverage label against the shared definition
  instead of leaving a divergent hard-coded value;
- require the `armenia` coverage area and source report;
- add Yerevan and Gyumri as inside-coverage checks;
- keep representative points outside all supported polygons as negative checks;
- preserve schema, hash, ID uniqueness, asset-size, total-size, and compressed
  initial-payload assertions.

Before a full refresh, use `--regions=armenia` as a focused extraction check.
This validates the PBF parser, ways/relations, naming context, and resource
usage without repeatedly processing every existing region.

### Phase 2: Refresh and audit both generated datasets

Run the full parking refresh and inspect:

- source timestamp and SHA-256;
- node/way/relation counts and discarded geometry;
- field completeness for capacity, parking type, access, cover, fee, and
  operator;
- naming-tier totals and Armenian samples for source, street, junction,
  landmark, place, and generic names;
- source-qualified IDs and cross-region duplicates;
- the expected seven Armenia parking chunks and point-index entries;
- Armenia polygon bounds/rings and Yerevan/Gyumri containment;
- total files, total bytes, largest asset, manifest, point index, and compressed
  3×3 payload against all existing budgets.

Run the full cycling-POI refresh and inspect:

- all 36 expected snapshot POIs, two way geometries, and no discarded records;
- category overlap and per-category website availability;
- Armenian-script names and fallback names for unnamed POIs;
- the expected 12 Armenia POI chunks and point-index entries;
- parity between the POI report, manifest, chunks, and website metrics.

Do not hand-edit anything under `public/data/parking/`,
`public/data/cycling-pois/`, or the generated reports in `src/data/`.

### Phase 3: Extend coverage, geolocation, and place search

Update `src/lib/geocoder.ts` and its tests:

- expand `PARKING_COVERAGE_BBOX` eastward to include the full Armenia polygon;
  the current combined planning bound is
  `-18.2,27.5,46.7,60.9`, but implementation should derive/check it against the
  downloaded polygon;
- add `AM` to the repeated Photon `countrycode` parameters;
- use `lang=default` for Armenian because Photon rejects `lang=hy`;
- test `Երևան`, `Yerevan`, and a focused Armenia request;
- keep malformed-result and duplicate-result behavior unchanged.

Confirm the selected Photon result is still checked against the generated
coverage polygon before loading chunks. Search suggestions may use Armenian
source names; the application should not transliterate or overwrite them.

Add focused coverage tests in `src/lib/parking-data.test.ts` for:

- Yerevan and Gyumri inside Armenia;
- a near-border Armenian point inside the polygon;
- nearby points in Georgia, Azerbaijan, Iran, or Turkey outside the supported
  polygon;
- unchanged mainland Spain, Canary Islands, UK, and Ireland behavior.

Add browser workflows that start directly in Armenia using mock GPS. They
should prove that the initial nine-tile neighbourhood loads, the map focuses on
Armenia, and the Edinburgh fallback message does not appear.

### Phase 4: Add complete Armenian localisation

Update `src/lib/i18n/locales.ts`:

- add `hy` to `supportedLocales`;
- configure `Հայերեն`, `hy-AM`, and `placeSearchLanguage: 'default'`;
- verify stored `hy`, browser `hy-AM`, unsupported-language fallback, and
  locale persistence.

Add an Armenian catalogue to `src/lib/i18n/messages.ts`. The current English
catalogue has 178 keys. The Armenian catalogue must:

- contain every key in the same order and preserve every `{placeholder}`;
- use short, natural product copy rather than literal machine translation;
- cover visible text, loading/error states, accessibility labels, route
  instructions, category labels, parking details, sharing, saved neuks, map
  controls, and coverage messages;
- keep proper names and the Bike Neuks brand stable;
- make one reviewed, consistent decision for `My neuks` terminology;
- describe all four coverage regions accurately.

Use a two-pass translation workflow:

1. create the structurally complete catalogue and pass placeholder/completeness
   tests;
2. have a fluent Armenian reviewer check terminology, grammar, tone, and
   accessibility in the running product.

Add Armenian cases to:

- `src/lib/i18n/locales.test.ts`;
- `src/lib/i18n/format.ts` tests for Armenian number, distance, and duration
  formatting;
- `src/lib/parking-names.test.ts` for generated `near`, `by`, street/place, and
  generic names while preserving Armenian source names;
- route-instruction tests for left, right, straight, start, and arrival copy;
- opening-hours and detail-format tests where locale-dependent strings appear.

The existing `LanguageProvider` should continue setting `<html lang="hy">`
after hydration. Verify browser-language auto-selection and manual switching
without moving or recreating the map.

### Phase 5: Verify Armenian typography and map rendering

The interface uses a system-font stack and two remote vector basemaps. Test,
rather than assume, that:

- Armenian letters render without tofu/missing-glyph boxes on macOS, iOS,
  Android/Chromium, and WebKit;
- light OpenFreeMap and dark CARTO styles show Armenian place/street labels at
  useful Yerevan zooms;
- parking names, POI names, menus, chips, detail rows, buttons, and errors wrap
  cleanly at 360, 375, and 390 CSS pixels;
- the category row remains usable if Armenian labels are longer than the
  English labels;
- language switching preserves the map canvas, viewport, selected point,
  active category, and saved-neuk state;
- accessible names and focus order remain correct.

If the existing font stack is insufficient on a supported platform, choose an
open Armenian-capable font with an explicit licence and evaluate its bundle
cost before adding it. Do not add a font merely for visual preference.

Record the reviewed viewport sizes and screenshots in `design-qa.md`. Embed the
screenshots in the implementation task as required by `AGENTS.md`.

### Phase 6: Make directions behavior region-aware

Run a real CycleStreets API check for a normal Yerevan trip with the existing
restricted public key. Record the response, route geometry, instructions, and
provider attribution separately from mocked parser tests.

Use this decision:

- **If a valid Armenia route is returned:** keep directions enabled, add a
  Yerevan browser workflow, validate route quality against the street network,
  and confirm the public-key terms allow this traffic.
- **If Armenia is unsupported or unreliable:** classify Armenia as an
  unsupported directions region, hide or disable the in-app route action for
  Armenia, add concise Armenian and existing-locale copy, and retain the
  external Google Maps action. Do not let every click fail with the generic
  transient error.

The initial Armenia release should not be blocked on adopting a new router.
If native in-app Armenia routing becomes a product requirement, evaluate
provider coverage, bicycle profiles, API quotas, browser-key exposure, privacy,
licensing, static-host compatibility, and failure behavior as a separate plan.

Also verify Google Maps links and optional Street View actions for Armenian
coordinates. Street View imagery is not an acceptance requirement; correct
link construction and a graceful unavailable state are.

### Phase 7: Update product copy, metadata, and contributor documentation

Replace user-facing three-region descriptions with four-region descriptions in:

- all four message catalogues;
- `src/app/layout.tsx` metadata and social-image alternative text;
- `public/site.webmanifest`;
- `public/og-image.svg` and its rendered `public/og-image.png`;
- `package.json` description and keywords;
- `README.md`;
- `CONTRIBUTING.md`;
- the project-shape summary in `AGENTS.md`.

README changes should cover:

- Armenia in features, fallback behavior, data architecture, commands, refresh
  inputs, offline limits, and source links;
- Armenian language selection and Photon's `default`-language behavior;
- measured post-refresh counts, chunks, cache size, and refresh resources;
- honest regional directions behavior;
- representative Armenia mock-GPS examples.

CONTRIBUTING changes should update the PBF/polygon counts and add Yerevan,
Gyumri, Armenian-script, and directions-capability checks to the refresh review
list.

### Phase 8: Regression and release verification

Run narrow checks first, followed by:

```bash
pnpm verify:data
pnpm verify:pois
pnpm test
pnpm lint
pnpm format
pnpm build
pnpm test:e2e
git diff --check
```

The browser suite should include:

- Yerevan and Gyumri mock-GPS parking;
- Armenian shops, repair, and hire categories;
- Armenian and English Yerevan search results;
- a stable Armenia `?parking=osm%3Anode%3A...` deep link;
- sharing and restoring that link;
- saving an Armenian point and preserving it through language changes;
- Armenian auto-selection, manual selection, persistence, and `<html lang>`;
- desktop/mobile light and dark themes;
- online, previously cached, and uncached/offline chunk behavior;
- outside-coverage and denied-location fallbacks;
- the chosen Armenia directions state;
- unchanged Edinburgh, London/England, Wales, Ireland, Madrid, mainland Spain,
  and Canary Islands smoke coverage.

Distinguish these evidence levels in the handoff:

- generated-data and unit-test proof;
- mocked browser workflow proof;
- live Photon proof;
- live CycleStreets or explicit unsupported-region proof;
- local static-export proof;
- remote CI proof;
- production deployment proof.

## Local implementation outcome

Implementation and technical verification were completed locally on
25 July 2026:

- the generated parking release contains 87,667 records in 4,349 chunks,
  including 56 Armenia records in seven chunks;
- the generated cycling-place release contains 13,212 records in 2,486 chunks,
  including 36 Armenia records in 12 chunks;
- `pnpm verify:data` and `pnpm verify:pois` passed, including Armenia coverage,
  manifest, checksum, index, schema, uniqueness, and asset-budget checks;
- all 162 Vitest tests and all 82 Playwright scenarios passed; the clean
  Playwright result used one worker after two parallel runs each exposed a
  different pre-existing load-sensitive test that passed immediately alone;
- `pnpm lint`, `pnpm format`, and `pnpm build` passed;
- live Photon checks returned Armenian-script Yerevan results with
  `countrycode=AM` and `lang=default`;
- a live CycleStreets check returned a usable 1,612-metre Yerevan cycle route
  with geometry and Armenian street instructions, so directions remain
  enabled;
- manual static-export QA covered light and dark themes at 1440, 390, 375, and
  360 CSS pixels, including Armenian category labels, generated fallback
  names, map content, and missing-glyph checks.

The Armenian catalogue is structurally complete and has automated and visual
coverage, but no fluent native Armenian editorial review was performed during
implementation. Native review of terminology, grammar, tone, and accessibility
copy remains recommended before deployment.

## Approval and delivery gates

Treat each gate separately:

1. **Plan approval:** agree the scope and directions behavior described here.
2. **Implementation:** edit source, translations, tests, docs, and generated
   data locally.
3. **Local verification:** complete data audits, checks, build, and browser QA.
4. **Commit:** stage only the intended Armenia work and generated artifacts.
5. **Push:** publish the reviewed commit to the requested branch.
6. **Deployment:** allow the `main` quality gate to deploy to Cloudflare Pages.
7. **Production verification:** verify both `neuk.bike` and
   `neuk-bike.pages.dev`, including an Armenian location and language switch.

Approval of this plan does not by itself authorize implementation, a data
refresh, commit, push, or deployment.

## Definition of done

Armenia support is complete when:

- both manifests include the Armenia coverage polygon and source;
- refreshed reports show valid checksums, geometry, naming, counts, and budgets;
- a user in Yerevan or Gyumri sees nearby Armenian parking and cycling places;
- Armenian and Latin place searches resolve within Armenia;
- all 178 Armenian messages are complete, reviewed, and accessible;
- Armenian text renders without clipping or missing glyphs on target browsers;
- deep links, sharing, saved neuks, categories, map movement, and offline cache
  behavior work in Armenia;
- directions either work with verified provider support or are explicitly and
  gracefully unavailable in Armenia;
- current countries and locales retain their existing behavior;
- documentation and metadata describe the shipped coverage accurately;
- local verification, commit, push, deployment, and production status are each
  reported truthfully and separately.
