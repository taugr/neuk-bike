# Save cycling places to My neuks plan

## Status

Implemented on 2026-07-23 on `codex/bike-neuk-categories-prototype`. Application
code, storage migration, generated point indexes, focused tests, E2E coverage,
and local browser verification are complete; commit, push, and deployment
remain release gates.

This plan superseded the parking-only saving limitation originally recorded in
`BIKE_NEUK_CATEGORIES_PROTOTYPE_PLAN.md`.

## Recommendation

Make My neuks a single global saved list containing parking and cycling places.
Keep the nearby map single-category, but allow My neuks to show a mixed list.

The first implementation should:

1. expose My neuks from Parking, Shops, Repair, and Hire;
2. add a direct bookmark action to selected cycling-place rows without changing
   the existing Directions interaction;
3. show Save/Remove in cycling-place map popups;
4. migrate existing version-1 parking saves without data loss;
5. resolve saved cycling places by ID through a small generated point index;
6. distinguish parking from cycling places at the point and saved-record level;
7. keep sharing, Street View, and parking details parking-only;
8. keep My neuks local-first with no account, backend, or database.

Do not add saved-list filters initially. A mixed list with clear type context is
the smallest useful design. Add filters later only if real saved-list size makes
them necessary.

## Current implementation constraints

### Saving and storage

- `src/lib/saved-neuks.ts` stores version-1 records under
  `cycle-parking-saved-neuks`.
- A record currently contains only `id`, `savedAt`, and a snapshot of the name
  and coordinates.
- `addSavedNeuk()` accepts `ParkingPoint` and discards cycling-place categories
  and opening hours.
- Saved identity is currently the raw point ID. That is sufficient for the
  parking-only release but does not explicitly separate parking and cycling
  datasets.
- Storage failures deliberately retain the current-session saves and show a
  localized warning. That resilience must remain.

### Saved data resolution

- My neuks sends every saved ID to `ParkingDataClient.loadPoints()`.
- The parking release has a global ID-to-chunk point index, so distant saved
  parking can be loaded without first moving the map.
- `CyclingPoiDataClient` currently loads only by location or bounds and has no
  point index or `loadPoints()` equivalent.
- The Scotland cycling-place release currently has 614 unique IDs. A formatted
  ID-to-chunk index for the current prototype would be about 43 KB.
- The current Scotland parking and cycling-place releases have zero overlapping
  raw IDs. This is useful evidence, not a sufficient long-term identity
  contract.

### Finder and map assumptions

- The My neuks entry point is rendered only while Parking is selected.
- Saved-list derivation, map points, active list points, details availability,
  marker styling, popup actions, and missing-record handling all assume saved
  points are parking.
- Cycling-place list rows currently expose Directions only when selected.
- Cycling-place map popups receive saved state but hide the existing Save button
  behind an `isParking` condition.
- Mobile parking marker selection opens parking details. Cycling places must not
  acquire parking details simply because they are shown inside My neuks.
- The panel reducer already supports Nearby/My neuks list navigation and
  Directions return context. Extend that model rather than adding a second
  saved-place panel.

## Product and interaction design

### Global My neuks entry

- Show the existing My neuks button in every nearby category.
- Keep one global count across parking, shops, repair, and hire.
- Opening My neuks preserves the active nearby category, selected point, map
  camera, and list scroll state.
- `Show nearby` returns to the same category that was active before My neuks
  opened.
- Hide the category chips inside My neuks for the first implementation. The
  saved list is intentionally mixed.

### Save and remove actions

- Keep Directions as the primary selected-row action for shops, repair, and
  hire.
- Add a compact direct Bookmark action beside Directions for cycling places.
  Use the existing filled/unfilled state, localized accessible names, focus
  treatment, and minimum touch target.
- Do not introduce a one-item overflow menu only to hold Save.
- Show the existing Save/Saved action in cycling-place map popups by removing
  the parking-only visibility condition.
- In My neuks, the same bookmark control removes a cycling place. Parking keeps
  its existing More-menu removal path unless a later visual prototype shows
  that one shared action treatment is materially clearer.
- Continue to show the saved badge on nearby map markers and unselected nearby
  rows for every point type.

### Mixed saved-list presentation

- Sort all resolved saves by distance, then by most recently saved, then by
  localized name, matching the current behavior.
- Parking rows retain their existing capacity/facility metadata.
- Cycling-place rows retain distance and opening-hours formatting.
- Because category chips are absent in My neuks, add compact localized type
  context only there, for example `Shop · Repair`. Show every explicit category
  once; do not infer capabilities.
- A point belonging to several chips is saved once and displays all of its
  explicit categories in My neuks.
- Use the existing selected-row Directions interaction for both parking and
  cycling places.
- Do not expose parking Details, parking Share, or Street View actions for a
  cycling place.

### Mixed saved map

- Show all resolved saved points together while My neuks is open.
- Use the existing saved-marker treatment as the dominant map state. Do not try
  to display several active chip colors simultaneously.
- Determine popup actions and mobile marker behavior from the point's kind, not
  from the nearby `discoverCategory`.
- Parking markers may still open Details on mobile. Cycling-place markers select
  the corresponding saved row and expose Directions/Remove, without entering
  the parking details view.

## Saved-record version 2

Introduce an explicit record kind and compound identity while reading existing
version-1 records as parking.

```ts
type SavedNeukKind = 'parking' | 'cycling-place';

type SavedNeukRecordV2 = {
  id: string;
  key: `${SavedNeukKind}:${string}`;
  kind: SavedNeukKind;
  savedAt: string;
  snapshot: {
    categories?: CyclingPoiCategory[];
    latitude: number;
    longitude: number;
    name: string;
    openingHours?: string;
  };
};
```

### Migration rules

- Keep the existing local-storage key.
- Accept version-1 payloads and normalize every valid record to
  `kind: 'parking'` with a derived compound key.
- Write version 2 on the next successful mutation; do not require a separate
  eager migration write during page load.
- Validate `kind`, compound key, coordinates, timestamp, category values, and
  optional opening-hours text.
- Deduplicate by compound key, not raw ID.
- Preserve version-1 order and `savedAt`.
- Treat unsupported future versions as unreadable rather than partially
  guessing.
- Keep the in-memory list when localStorage reads or writes fail.

The snapshot is a resilient fallback and supplies immediate local rendering. A
successfully resolved current dataset record remains authoritative for name,
coordinates, categories, and opening hours.

## Cycling-place point index and client

Saving creates a persistent by-ID retrieval requirement, so the earlier
prototype decision to omit a cycling-place point index should now change.

### Generated data

- Add a content-addressed cycling-place point index mapping ID to chunk path.
- Add `pointIndexPath` to the cycling-place manifest and advance its schema
  version.
- Update the generator report and verifier to cover:
  - index entry count;
  - every point appearing exactly once;
  - every index path referencing a declared chunk;
  - every indexed ID existing in that chunk;
  - no duplicate IDs;
  - checksum/report parity.
- Keep the cycling-place release separate from parking.
- Do not regenerate the parking release for this feature.

### Client behavior

- Add `CyclingPoiDataClient.loadPoint()` and `loadPoints()` with the parking
  client's `points`, `missingIds`, `failedIds`, and `allowPartial` semantics.
- Deduplicate requested IDs and group them by chunk before fetching.
- Reuse loaded chunks and in-flight requests.
- Keep valid points when one saved cycling-place chunk fails.
- Use strict single-point loading only where a caller explicitly needs it.

### Combined saved resolution

- Partition saved records by `kind`.
- Resolve parking and cycling-place IDs through their respective clients in
  parallel.
- Merge resolved records by compound saved key.
- Track missing and failed keys by kind so an identical raw ID could not affect
  the wrong dataset.
- Keep successfully resolved items visible when the other client or chunk
  fails.
- Reuse the existing one-message Retry treatment for partial failures.
- Show the existing `No longer in the current data` treatment for a confirmed
  missing item and allow removal from storage.

## Finder and type-model changes

- Add a small point-kind helper or discriminated view model instead of
  repeatedly checking the active chip.
- Preserve `CyclingPoiPoint.categories` when a point enters saved state.
- Replace saved-list conditions such as
  `parkingView === 'saved' && discoverCategory === 'parking'` with
  point-kind-aware mixed-list logic.
- Make `mapPoints`, `activeListPoints`, `availablePoints`, selected-point lookup,
  directions lookup, saved badges, and missing records operate on compound saved
  identity where the datasets can mix.
- Keep nearby selection single-category and raw data loading unchanged.
- Keep `?parking=` deep links parking-only.
- Keep `parking-panel.ts` as the canonical list/details/directions navigation
  reducer. Add focused reducer tests only if the event/state contract must carry
  the preserved nearby category or a compound selected key.

## Analytics

- Preserve the existing `neuk_saved`, `neuk_removed`, and `my_neuks_opened`
  event names for continuity.
- Add `neuk_kind` and explicit cycling categories.
- Preserve existing parking ID/name fields during the transition if current
  dashboards depend on them.
- Count one multi-category cycling place once.

## Implementation sequence

### Phase 1: storage and identity

1. Add version-2 types, parser, migration, compound-key helpers, and unit tests.
2. Make save/remove/is-saved operations accept parking and cycling points.
3. Preserve session-only behavior and cross-tab storage synchronization.

### Phase 2: generated index and client

1. Generate and verify the cycling-place point index.
2. Advance the cycling-place manifest schema.
3. Add indexed `loadPoint()`/`loadPoints()` client behavior and focused tests.

### Phase 3: mixed My neuks state

1. Resolve parking and cycling saves through their correct clients.
2. Replace parking-only saved derivations with mixed point-kind-aware state.
3. Keep missing/failed handling, sorting, selection, Directions return, and map
   camera behavior.

### Phase 4: save surfaces and saved-list UI

1. Show My neuks from every nearby category.
2. Add the direct cycling-place bookmark action beside Directions.
3. Enable Save/Saved in cycling-place map popups.
4. Render mixed saved rows with type context and existing metadata.
5. Update mixed saved markers and popup behavior.
6. Complete English, Gaelic, and Spanish copy parity.

### Phase 5: verification

1. Run focused storage, client, panel, and rendering tests.
2. Run the generated cycling-place verifier.
3. Run the full test, lint, format, and static build gates.
4. Verify the production static export in the browser at mobile and desktop
   widths.
5. Keep the refreshed local app running for review.

## Test plan

### Unit tests

- Parse valid version-1 records as version-2 parking saves.
- Round-trip version-2 parking and cycling-place records.
- Reject malformed kinds, keys, categories, coordinates, dates, and snapshots.
- Deduplicate by compound key.
- Prove that the same raw ID in two kinds remains distinct.
- Preserve immutable add/remove behavior and newest-first insertion.
- Split cycling indexed loads across chunks.
- Cover missing IDs, partial chunk failure, strict failure, duplicate requests,
  cached chunks, and in-flight reuse.

### Browser/E2E tests

- Save a shop from its selected list row; verify confirmation, filled bookmark,
  saved marker badge, and global count.
- Save/remove a cycling place from its map popup.
- Save one multi-category place from Shops, switch to Repair, and verify it is
  already saved rather than duplicated.
- Save one parking place and one cycling place, reload, open My neuks, and verify
  both rows and markers.
- Open Directions from a saved cycling place and return to My neuks with the
  point still selected.
- Return from My neuks to the previously active category with its list/map state
  restored.
- Resolve a distant saved cycling place through the point index.
- Fail one cycling-place chunk and verify available parking and cycling saves
  remain usable with Retry.
- Confirm a missing cycling-place record shows the removable missing-data state.
- Preserve version-1 parking saves after upgrade.
- Preserve current-session cycling saves when localStorage writes fail.
- Verify English, Gaelic, and Spanish labels and announcements.
- Verify keyboard order, accessible names, `aria-pressed`, visible focus, and
  minimum touch targets.
- Verify 360/390-pixel mobile layouts, 1280-pixel desktop, no clipped actions,
  and no horizontal document overflow.

## Acceptance criteria

- Any nearby shop, repair location, or hire location can be saved and removed
  from its list row and map popup.
- My neuks is reachable from every nearby category and shows one global count.
- Existing version-1 parking saves survive unchanged.
- A multi-category cycling place occupies one saved record.
- Mixed saved parking and cycling places survive reload and resolve from their
  static releases even when distant from the current map.
- A failed or missing saved item does not hide other valid saves.
- Directions works for every resolved saved item and returns to My neuks.
- Parking-only Details, Share, and Street View do not leak onto cycling places.
- Single-category nearby map behavior and cycling-place lazy loading remain
  unchanged.
- English, Gaelic, and Spanish remain complete.
- The full repository quality gates and relevant E2E scenarios pass.
- The local static preview is verified and kept running.
- Nothing is deployed without separate approval.

## Non-goals

- Accounts or cloud synchronization.
- A backend, database, or live Overpass lookup.
- Saved-list category filters in the first implementation.
- Sharing or social preview links for cycling places.
- Parking details or Street View for cycling places.
- Live availability, live opening status, prices, ratings, or reviews.
- Changing the default nearby category from Parking.
- Regenerating or migrating the parking dataset.
- Committing, pushing, or deploying during this planning step.

## Decisions to confirm before implementation

The recommended defaults are:

1. **Mixed list:** one global My neuks list, without filters.
2. **Save affordance:** direct Bookmark beside cycling-place Directions.
3. **Saved type context:** localized category labels appear only in My neuks.
4. **Map treatment:** all My neuks markers use the saved-marker emphasis rather
   than several category colors.
5. **Data contract:** add the small cycling-place point index now rather than
   relying on local snapshots or previously loaded chunks.

These choices keep the feature understandable, local-first, and reliable while
limiting changes to the existing nearby browsing experience.
