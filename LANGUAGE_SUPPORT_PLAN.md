# Language Support Feature Plan

Status: implemented and verified locally, ready for review
Plan date: 2026-07-17

## Recommendation

Add a language setting to the existing shared settings popover and support:

- English (`en`, formatting locale `en-GB`)
- Scottish Gaelic (`gd`, formatting locale `gd-GB`)
- Spanish (`es`, formatting locale `es-ES`)

Use a small, typed, in-repo message catalogue and a client-side language
provider. Keep the current single static route and parking dataset. Persist the
choice in `localStorage`, use the browser's preferred supported language for a
first visit, and fall back to English.

This is preferable to locale-prefixed routes for the first release. It avoids
tripling the exported app shells, changing parking-data URL resolution, changing
share links, or complicating the service worker. A shared parking link should
open in the recipient's chosen language rather than carrying the sender's
language.

## User experience

The existing desktop and mobile settings menus are produced by the same
`renderThemeSettings` function in
`src/components/cycle-parking-finder.tsx`. Add the language control directly
after Theme so both layouts receive it automatically.

Recommended control:

- a compact native select labelled with the translated word for Language;
- options always shown by their own names: `English`, `Gàidhlig`, `Español`;
- immediate application when changed;
- the menu closes after selection, matching the current theme interaction;
- an analytics event records only the stable locale code.

The selection order on first load should be:

1. a valid value from `cycle-parking-language` in `localStorage`;
2. the first supported entry in `navigator.languages`;
3. English.

Changing language must update `document.documentElement.lang` as well as the
visible and accessible interface. The product name `Bike Neuks` remains the
brand in every language.

## Translation boundary

Translate:

- settings, search, location and parking-list controls;
- headings, status messages, validation and recoverable errors;
- directions controls, route summaries and instruction templates;
- parking attributes such as spaces, type, cover and access;
- distances, durations, counts and plural forms;
- map popups, marker labels and MapLibre control labels;
- dialogs, button titles, screen-reader labels and live regions;
- generated parking-name connectors such as `near`, `by`, and
  `cycle parking`;
- coverage descriptions such as `UK, Ireland and Spain` when presented in the
  interface.

Do not translate:

- `Bike Neuks`, `taugr`, `OpenStreetMap`, `MapLibre`, `Nominatim`,
  `CycleStreets`, or `Street View` brand names;
- street, landmark and place names supplied by OSM, Nominatim or CycleStreets;
- source attribution, licence names, legal notices or URLs;
- analytics event names and internal status identifiers;
- source-authored parking names where `properties.nameSource === "source"`;
- basemap place labels, which should continue using the source style's local
  names.

Static social metadata and the web app manifest remain English in this first
release because all users share one canonical static URL and manifest. If
localized indexing and share previews become a requirement, add `/en/`, `/gd/`
and `/es/` routes as a separate follow-up rather than mixing that work into the
menu setting.

## Architecture

### 1. Typed locale foundation

Add:

- `src/lib/i18n/locales.ts`
  - supported locale codes, formatting tags and self-names;
  - validation and browser-language resolution;
  - Nominatim fallback chains (`gd,en`, `es,en`, `en`);
- `src/lib/i18n/messages.ts`
  - the English catalogue as the canonical shape;
  - complete Gaelic and Spanish catalogues checked against that shape;
  - parameterized messages for names, counts and statuses;
- `src/lib/i18n/format.ts`
  - `Intl.NumberFormat` and `Intl.PluralRules` helpers;
  - locale-aware distance, duration and capacity formatting;
- `src/components/language-provider.tsx`
  - resolves and persists the locale;
  - exposes the locale, catalogue and `setLocale`;
  - updates the document language.

Wrap the existing app in the provider from `src/app/layout.tsx`. English is the
server-rendered default, which keeps hydration deterministic. A stored or
browser-selected language is applied immediately after hydration; do not add a
blocking locale fetch or a new runtime dependency.

### 2. Replace display strings without changing domain state

The code currently uses English labels as logic keys, notably the
`parkingDetailLabels` set and checks such as `detail.label === "Spaces"`.
Refactor parking presentation objects to carry stable semantic keys such as:

- `distance`
- `spaces`
- `type`
- `cover`
- `access`

Translate only at render/format time. Keep internal unions such as
`DirectionsState`, `LocationState`, `ThemeMode` and route maneuver values in
English. This prevents a locale change from invalidating state, caches, tests,
analytics or control flow.

Update these primary surfaces:

- `src/components/cycle-parking-finder.tsx`
- `src/components/cycle-parking-map.tsx`
- `src/lib/parking.ts`
- `src/lib/geo.ts`
- `src/lib/cyclestreets.ts`
- `src/lib/geocoder.ts`

The current audit finds roughly 90 genuine user-facing strings across those
files, plus MapLibre's built-in control labels.

### 3. Localize generated parking names at runtime

Do not regenerate or duplicate the 87,611-record dataset for each language.
The generated chunks retain `properties.nameSource`, which is enough to safely
localize the templates used by the normalizer:

| `nameSource` | Current generated shape                              | Runtime treatment                          |
| ------------ | ---------------------------------------------------- | ------------------------------------------ |
| `junction`   | `<road> near <road>`                                 | preserve both names; translate `near`      |
| `landmark`   | `<road> by <landmark>` or `<landmark> cycle parking` | preserve names; translate connector/suffix |
| `street`     | `<street> cycle parking`                             | preserve street; translate suffix          |
| `place`      | `<place> cycle parking`                              | preserve place; translate suffix           |
| `source`     | source-authored name                                 | leave unchanged                            |
| `generic`    | generic parking label                                | translate known generic template           |

Add a pure `formatParkingDisplayName(point, locale)` layer after the existing
curated-name lookup. Keep point IDs, source names and share URLs unchanged.
Unit tests must cover names containing accents and ensure source-authored names
are never rewritten.

### 4. Localize external-data presentation

Nominatim supports the `accept-language` search parameter. Extend
`buildPlaceSearchUrl` to receive the selected locale and request the appropriate
fallback chain. Clear or partition the current place-search cache by locale so
an English result cannot be reused after switching to Gaelic or Spanish.

CycleStreets road names remain proper names. Continue parsing its stable route
data, normalize each instruction to the existing maneuver enum, and render the
instruction through local templates. Do not display raw English turn phrases
when a recognized maneuver is available. Unknown upstream phrases may fall
back to the source text so a route remains usable.

Pass the locale catalogue into `CycleParkingMap` for React popup content,
markers and current-location labels. Supply MapLibre's documented `locale`
table when constructing the map so Zoom, Popup and Attribution control labels
are translated. Preserve the current camera in a ref when language changes and
the MapLibre instance is recreated; selecting a language must not move the
user away from the area they are inspecting.

### 5. Offline and static-export behavior

All three catalogues ship inside the normal JavaScript bundle, so switching
language requires no network request and remains available offline. Keep one
app shell and one parking dataset. Bump the service-worker cache version when
the feature is implemented so an installed PWA does not mix the old English
bundle with the localized shell.

Expected size impact is only tens of kilobytes before compression and no
meaningful Cloudflare usage change.

## Translation workflow

1. Freeze the English catalogue and its parameter meanings.
2. Produce complete Spanish and Gaelic drafts in separate catalogue objects.
3. Run automated completeness checks: identical keys, no empty values and no
   missing placeholders.
4. Have a fluent/native Spanish reviewer and a fluent/native Scottish Gaelic
   reviewer check the full in-context UI, especially:
   - parking terminology;
   - short imperative route instructions;
   - permission/error language;
   - Gaelic number and plural forms;
   - generated-name connectors.
5. Record reviewer corrections in the catalogue rather than adding component
   exceptions.

Machine-generated copy can seed the implementation, but native review is a
release gate for Gaelic and strongly recommended for Spanish.

## Implementation phases

### Phase 1: Locale foundation and semantic keys

- Add locale types, catalogues, provider and persistence.
- Add catalogue completeness and locale-resolution tests.
- Replace English display labels used as program logic with semantic keys.
- Keep the visible app English while this refactor lands.

Exit condition: English behavior is unchanged and the full existing unit suite
passes.

### Phase 2: Menu and interface copy

- Add the language setting to the shared menu.
- Move finder, status, dialog and accessibility copy into the catalogues.
- Update `<html lang>` and locale-aware number formatting.
- Add desktop and mobile persistence tests.

Exit condition: switching languages updates every core finder surface without
reloading, and reloading preserves the selection.

### Phase 3: Map, parking names, search and directions

- Localize parking detail values and generated-name templates.
- Request localized Nominatim results.
- Localize route instructions, duration and distance.
- Localize React map content and MapLibre controls while preserving camera.
- Keep proper names and attribution verbatim.

Exit condition: an Edinburgh flow in Gaelic and a Madrid flow in Spanish can
search, select, share and open directions without unexpected English UI copy.

### Phase 4: Offline, QA and documentation

- Bump the service-worker cache version.
- Add offline locale persistence coverage.
- Update `README.md` with language behavior and translation boundaries.
- Run native-language review and apply corrections.
- Run the production static preview on desktop and at `390 x 844`.

Exit condition: all automated checks pass, the three languages fit both menu
layouts, and the installed/offline app retains the chosen language.

## Verification plan

### Unit tests

- supported-locale parsing and browser fallback order;
- catalogue key and interpolation-placeholder parity;
- English, Gaelic and Spanish number/plural formatting;
- distance, duration, parking details and route instruction formatting;
- generated `junction`, `landmark`, `street`, `place`, `source` and `generic`
  parking names;
- Nominatim `accept-language` and locale-specific cache behavior;
- MapLibre locale-table completeness for controls used by the app.

### Browser tests

- English remains the default when no preference exists;
- browser Spanish/Gaelic is selected on a first visit;
- an explicit menu selection overrides browser preference;
- selection survives reload and updates `<html lang>`;
- switching back to English works;
- language setting appears in both desktop and mobile menus;
- Spanish Madrid search, parking details and local directions are localized;
- Gaelic Edinburgh location, fallback, parking details and directions are
  localized;
- proper names, attribution and share links remain unchanged;
- map camera, selected parking and active route survive a language change;
- offline reload uses the saved language;
- no clipped menu labels or direction controls at `390 x 844`.

### Required project checks

- `pnpm test`
- `pnpm lint`
- `pnpm format`
- `pnpm build`
- `pnpm test:e2e`
- production static-preview review using
  `.agents/skills/manual-test/scripts/serve-static-export.sh`

No parking-data refresh is required unless the implementation chooses to add
new structured naming fields, which this plan deliberately avoids.

## Acceptance criteria

- The menu offers English, Gàidhlig and Español on desktop and mobile.
- The selected language applies immediately and persists locally.
- The document language, visible copy, accessibility labels and live regions
  agree.
- Search results request the selected language with an English fallback.
- Parking attributes, generated parking-name connectors and route templates are
  localized.
- Proper names and legal attribution are not translated.
- Existing share URLs and static-export routing do not change.
- Language switching works offline after the app has been cached.
- Existing English tests continue to pass and focused Gaelic/Spanish E2E flows
  are added.
- Translation catalogues pass native review before deployment.

## Effort estimate

| Work                                               |             Estimate |
| -------------------------------------------------- | -------------------: |
| Locale foundation and semantic-key refactor        |            0.5-1 day |
| Menu and full interface extraction                 |            0.5-1 day |
| Parking names, search, directions and map controls |            0.5-1 day |
| Unit/E2E/offline QA and documentation              |            0.5-1 day |
| Spanish and Gaelic language review/corrections     |            0.5-1 day |
| **Total**                                          | **3-4 focused days** |

The highest uncertainty is translation review, not code or hosting. No new
runtime dependency, dataset refresh, backend, paid service or Cloudflare plan
change should be needed.

## Risks and mitigations

- **Translation quality:** treat native Gaelic review as a release gate and
  keep all copy centralized for correction.
- **English strings hidden in helpers:** enforce catalogue use with the audit
  list and locale-specific E2E flows, including accessibility names.
- **Translated labels used as logic:** complete the semantic-key refactor before
  extracting UI copy.
- **Mixed-language route instructions:** normalize maneuvers first and retain
  upstream road names only as proper nouns.
- **Map movement on locale change:** preserve center and zoom across MapLibre
  recreation and cover this in E2E.
- **Stale installed PWA:** bump the service-worker cache version.
- **Current Spain worktree overlap:** implement this only after the existing
  Spain expansion is committed or deliberately kept as the base, because the
  finder, layout, geocoder and E2E files overlap heavily.

## Reference documentation

- [Nominatim search result language](https://nominatim.org/release-docs/latest/api/Search/#language-of-results)
- [MapLibre locale configuration](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/#locale)
- [MapLibre locale example](https://maplibre.org/maplibre-gl-js/docs/examples/locale-switching/)
