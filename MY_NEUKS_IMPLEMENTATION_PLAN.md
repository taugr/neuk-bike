# My neuks implementation plan

## Status

Implementation is in progress in the current working tree. Persistence, saved
markers, the My neuks view, popup actions, localisation, and the first browser
workflows are present. This revision records the remaining interaction
refinement: list actions should be contextual to an explicitly selected row.

The product term will be **My neuks**. The interaction follows the useful parts
of Google Maps' saved-place model, but stays lightweight and map-first:

- Nearby remains the default experience.
- Directions and a More menu are contextual actions on an explicitly selected
  neuk, not controls repeated on every nearby row. Save/remove and Share live
  inside More.
- `My neuks · N` is a low-emphasis action in the Nearby heading, not a permanent
  tab or a second primary navigation system.
- Saved status is visible on the normal map without replacing nearby rank
  numbers.
- Opening My neuks swaps the content of the existing sheet/sidebar and does not
  open a modal, navigate to a new route, or move the map initially.
- My neuks is stored on this device and browser profile. Accounts and cloud sync
  are out of scope for the first version.

## Goals

1. Let someone save or remove a neuk with one clear action.
2. Make saved neuks recognisable on the normal Nearby map while preserving the
   meaning of numbered nearby pins.
3. Provide a quick, calm way to browse saved neuks, select one, share it, or get
   directions.
4. Persist the list across reloads without adding a backend.
5. Preserve the current responsive sheet, desktop sidebar, deep-link,
   directions, localisation, and static-export behaviour.

## Non-goals

- User accounts, cross-device sync, or server storage.
- Multiple named lists, collaborative lists, notes, or list sharing.
- A separate `/saved` route or modal.
- Changing the nearby ranking algorithm.
- Replacing rank numbers with bookmark pins in the Nearby view.
- Automatically fitting the map to every saved neuk when My neuks opens.

## Product behaviour

### 1. Saving from Nearby

- Compact Nearby rows are informational. They expose no Directions, Share, or
  Save buttons until the user explicitly selects the row.
- The automatically closest row can keep its rank and nearest-result visual
  treatment, but it is not an action-bearing selected state. Do not reveal list
  actions merely because there is no explicit selection yet.
- Selecting a row reveals an inline action cluster with a compact `Directions`
  text action and a 44 px `More actions` button.
- Keep the action cluster inside the row's existing outer surface. Do not add a
  divider, separate footer, filled full-width button, inset container, or
  segmented control.
- `More actions` opens a compact menu with `Save to My neuks` or
  `Remove from My neuks` first, followed by `Share`.
- The action uses an outline bookmark and the accessible label
  `Save {name} to My neuks` when unsaved.
- After saving, it uses a filled bookmark and the accessible label
  `Remove {name} from My neuks`.
- A saved but unselected Nearby row shows a small filled bookmark as status,
  not as a button. Its accessible description includes `Saved to My neuks`.
  Selecting the row reveals the interactive `Saved` toggle.
- Saving or removing updates the header count and map marker immediately. It
  does not change the selected neuk, scroll position, or map camera.
- Use a short live-region confirmation such as `Saved to My neuks` or
  `Removed from My neuks`. Do not add a persistent `Saved` chip to the row.
- The selected map popup gets the same save/remove action so the operation is
  available when a neuk was selected directly on the map.

### 2. Accessing My neuks

- Change the Nearby list heading into a two-sided header:
  - left: `Nearby bike neuks · 8 closest`;
  - right: bookmark icon plus `My neuks 3`.
- Treat the right side as a normal button with a visible focus state, not as a
  selected tab or pill.
- Disable it only while saved state is being read for the first time. Once
  hydration finishes it remains available at a count of zero so the empty state
  is discoverable.
- The collapsed mobile summary continues to describe the active view. It shows
  Nearby details in Nearby mode and `My neuks · N saved` in My neuks mode.

### 3. Saved markers in the normal Nearby map

Marker semantics must remain unambiguous:

| Neuk state                                         | Nearby-map marker                                 |
| -------------------------------------------------- | ------------------------------------------------- |
| Ranked and not saved                               | Existing numbered rank pin                        |
| Ranked and saved                                   | Existing numbered pin plus a small bookmark badge |
| Saved, visible in the current area, and not ranked | Standalone bookmark pin                           |
| Selected and saved                                 | Existing selected treatment plus bookmark status  |
| Not saved and not ranked                           | Existing default marker behaviour                 |

The rank number always continues to mean nearby order. A bookmark is an
additional saved-status cue, never a replacement for that number. Colour is not
the only differentiator: the bookmark glyph and accessible marker label also
communicate saved status.

### 4. Opening My neuks

- Swap the content inside the existing bottom sheet/sidebar.
- Do not change the URL.
- Do not move or zoom the map merely because the view opened.
- Hide the place-search controls in this view; the current GPS or searched
  reference location still determines distances.
- Use the header `My neuks · N saved` with a low-emphasis `Show nearby` action.
- Sort resolved saved neuks by distance from the current reference location.
  Break equal-distance ties by most recently saved, then name.
- Saved rows have no rank circles because their order is not a nearby ranking.
- Unselected saved rows have no action controls or bookmark status glyph. Their
  membership is already clear from the My neuks heading and list context.
- The selected saved row exposes the same inline `Directions` and `More
actions` cluster. Its menu starts with `Remove from My neuks`, followed by
  `Share`.
- A missing saved record is the exception: it cannot be selected or routed to,
  so keep a directly available `Remove` button on that row.
- Selecting a saved row selects its marker and pans/focuses the map using the
  existing selected-neuk behaviour. If it is far away, its data is loaded by ID
  first and the map then travels to it.

### 5. Map behaviour in My neuks

- Show saved bookmark pins only; hide unsaved numbered and default parking
  markers.
- Keep the user's current camera when the view first opens. Do not fit all saved
  pins, since a list may span several countries.
- Render saved pins that fall in the current visible map area and always pin the
  selected saved neuk even when it is outside that area before focus begins.
- Highlight the selected bookmark pin without turning it into a rank number.
- Continue loading viewport chunks as the user pans so normal data is ready
  when they return to Nearby, but do not render those unsaved points in this
  mode.

### 6. Returning to Nearby and directions

- Before opening My neuks, retain the Nearby selected ID, list scroll position,
  and map camera.
- `Show nearby` restores those values instead of recalculating or resetting the
  Nearby experience.
- Retain the My neuks selection and scroll position separately so reopening the
  view feels continuous.
- Starting Directions from My neuks leaves the underlying view mode as My
  neuks. Exiting Directions returns to the My neuks panel and selection.
- Starting Directions from Nearby continues to return to Nearby.
- A place search or `Near me` action is performed from Nearby. If one is
  initiated through another existing path while My neuks is open, switch back
  to Nearby before applying it.

### 7. Empty, loading, and unavailable states

- Empty heading: `No neuks saved yet`.
- Supporting copy: `Select a bike neuk, then tap the bookmark to keep it here.`
- Add a small note: `Saved on this device`.
- Provide a `Show nearby` button in the empty state; do not invent suggested
  content or fill the panel with decoration.
- While saved points are resolving, show a compact loading status inside the
  list rather than blocking the map.
- If a saved ID no longer exists in the current generated dataset, keep its
  stored name in the list, mark it `No longer in the current data`, disable map
  selection and Directions for it, and leave its remove button available. Do
  not silently delete someone's saved choice.
- If local storage is unavailable or full, keep the in-memory result for the
  current session and announce that it could not be saved on this device.

## Persistence model

Create `src/lib/saved-neuks.ts` and keep browser storage details out of the main
finder component.

Use the local-storage key `cycle-parking-saved-neuks` with a versioned payload:

```ts
type SavedNeukRecord = {
  id: string;
  savedAt: string;
  snapshot: {
    latitude: number;
    longitude: number;
    name: string;
  };
};

type SavedNeuksStorage = {
  version: 1;
  items: SavedNeukRecord[];
};
```

The generated parking ID is canonical. The small snapshot is only a fallback
for explaining and removing an item whose current record cannot be resolved;
fresh dataset fields always win when the point exists.

The module will provide pure, tested helpers to:

- parse and validate unknown stored JSON;
- discard malformed individual records without losing valid ones;
- deduplicate by ID;
- add, remove, and test membership without mutating the current array;
- read and write safely around browser and quota errors;
- subscribe to the browser `storage` event so another open tab stays in sync.

Saved state will have an explicit hydration status (`loading`, `ready`, or
`storage-error`) so the UI never treats a not-yet-read list as a confirmed empty
list.

## Data loading

The existing `ParkingDataClient.loadPoint(id)` is appropriate for a single deep
link but is inefficient for a list spread over several chunks. Add a bulk
`loadPoints(ids)` API in `src/lib/parking-data.ts` that:

1. initialises and reuses one in-flight point-index request;
2. resolves IDs to chunk keys;
3. deduplicates and loads the required chunks in bounded batches;
4. collects resolved points before the client's LRU cache can evict older
   chunks;
5. returns both resolved points and missing IDs.

This keeps My neuks compatible with the static, versioned chunk architecture
and avoids a database or full-dataset download. Add focused tests for duplicate
IDs, shared chunks, missing IDs, fetch failure, and more unique chunks than the
cache limit.

## Component and state changes

### `src/components/cycle-parking-finder.tsx`

- Import Lucide `Bookmark` and the new saved-neuks helpers.
- Add `parkingView: 'nearby' | 'saved'`.
- Keep independent selected IDs and list scroll offsets for the two views.
- Add saved-record hydration state and a map of resolved saved points.
- Derive:
  - `savedIds` for constant-time marker and button checks;
  - `savedListPoints`, sorted with the existing `sortByDistance` helper;
  - missing records for the removable unavailable rows;
  - map points as the union needed for the active view, deduplicated by ID.
- Hydrate saved records after mount, bulk-resolve them after the parking client
  is ready, and reapply locale-specific parking names when the locale changes.
- Add save/remove handlers shared by list rows and map popups.
- Extract the repeated result-row markup into a small internal component or
  render helper that receives the view mode and action set. Do not fork two
  nearly identical lists.
- Make explicit selection, not `index === 0`, the condition for rendering the
  inline list actions. Keep the current closest-row calculation only for rank and
  visual emphasis.
- Render Directions as a full-height, icon-only action beside the More menu
  trigger inside one `parking-list-actions` cluster, with a 44px touch target
  and an accessible label. Keep their layout and focus order consistent across
  Nearby and My neuks. Put Save/remove first and Share second in the menu, and
  render the menu in the document top layer so scrolling and sticky sheet
  content cannot cover it.
- Add a non-interactive saved-status element only to saved, unselected Nearby
  rows. Do not render it in My neuks, where it would repeat the list's meaning.
- Make the place-search panel conditional on Nearby mode.
- Keep the current `parking-list-scroll` as the only scrolling owner and restore
  each view's `scrollTop` after its content has rendered.
- Capture `my_neuks_opened`, `neuk_saved`, and `neuk_removed` analytics events
  with parking ID, source (`list` or `popup`), and resulting count. Do not send
  the contents of the saved list.

### `src/components/cycle-parking-map.tsx`

Add props for:

- `parkingView`;
- `savedPointIds`;
- save/remove state and callback for the selected popup.

Update marker presentation to accept `isSaved` and the active view. Extract the
presentation decision into a pure exported helper (or move it into
`src/lib/map-pins.ts`) so the marker matrix can be unit tested without MapLibre.

The map component should own camera preservation because it has direct access
to MapLibre's exact centre and zoom:

- on `nearby -> saved`, capture the camera and suppress generic focus effects;
- leave the camera untouched until the user selects a saved row or moves it;
- on `saved -> nearby`, restore the captured camera and suppress the automatic
  nearby fit for that transition;
- continue using the current focus behaviour for an explicit saved selection.

Use the Lucide bookmark artwork consistently in React content and marker DOM;
do not introduce a separately drawn bookmark shape. Update marker accessible
labels to include `saved to My neuks` where applicable.

### `src/lib/map-pins.ts`

- Preserve current safety limits and viewport filtering.
- In Nearby mode, allow resolved saved points to participate as normal visible
  candidates while keeping only the eight ranked points and current selection
  pinned.
- In My neuks mode, pass saved points as the candidate collection and pin only
  the current saved selection. Do not pin every saved point globally.

### `src/app/globals.css`

- Add styles for the two-sided list heading, contextual bookmark button,
  saved-row action area, standalone bookmark marker, rank bookmark badge, and
  selected saved marker.
- Reuse the existing colour tokens, focus ring, active-row surface, and 44 px
  minimum mobile action target.
- Simplify compact list rows to one content grid with no reserved action
  columns or empty dividers.
- Give selected rows a trailing inline cluster containing an accent-coloured
  Directions text action and an unbordered 44 px More trigger. Keep it inside
  the existing item boundary without a divider.
- Style the unselected Nearby saved-status glyph as a quiet indicator inside
  the row rather than another action column.
- Removing or moving actions must not cause the sheet body to become the outer
  scroll owner or introduce horizontal overflow.
- Verify both light and dark themes and long translated strings.

## Localisation

Add complete English, Gaelic, and Spanish entries in
`src/lib/i18n/messages.ts`, including:

- My neuks;
- `{count} saved`;
- Show nearby;
- Save/remove accessible labels;
- Saved/removed confirmations;
- Empty-state heading and help;
- Saved on this device;
- Loading saved neuks;
- No longer in the current data;
- Storage failure;
- Saved marker description.

Avoid building sentences by concatenating translated fragments. Use message
parameters for names and counts, and verify the locale key sets remain aligned.

## Accessibility

- All bookmark actions are real buttons with names that include the neuk name.
- Filled versus outline is reinforced by the label and pressed/saved state;
  colour alone is not used.
- Use `aria-pressed` on directly visible save/remove toggles such as the popup.
- Keep the selected row button first in reading order, followed by Directions
  and More. Move focus to the first menu item when More opens, and return focus
  to More when Escape closes it.
- When selection moves, remove the previous row's contextual actions from the
  tab order. Never leave focus in a control that disappears as a side effect of
  saving, sharing, or starting Directions.
- Give the non-interactive Nearby saved-status glyph an accessible description
  without exposing it as a button or adding it to the tab order.
- Announce save, remove, storage-error, and missing-record outcomes through the
  existing status-message pattern.
- Move focus to the My neuks heading after the view swap only for keyboard
  activation; do not steal focus after pointer activation.
- Keep MapLibre markers keyboard operable and include saved status in their
  accessible names.
- Respect reduced-motion settings for panel and camera transitions.

## Test plan

### Unit tests

Add `src/lib/saved-neuks.test.ts` for:

- empty, valid, corrupt, partially corrupt, duplicate, and future-version
  payloads;
- immutable add/remove/toggle behaviour;
- deterministic ordering and saved timestamps;
- safe storage exceptions.

Extend `src/lib/parking-data.test.ts` for the bulk point-loading cases described
above. Extend `src/lib/map-pins.test.ts` or add a focused marker-presentation
test for every row in the marker matrix, including selected and Directions
states.

### Playwright workflows

Seed and inspect local storage explicitly so each test remains isolated:

1. Select the nearest row, save it, verify the count and bookmark marker badge,
   reload, and confirm persistence.
2. Remove it and confirm the count, marker, and stored payload update.
3. Open My neuks and verify no initial map-camera change.
4. Verify saved rows have no ranks, unselected rows have no action controls,
   and the selected row exposes Directions and More.
5. Select a distant saved neuk, verify it is loaded by ID and the map focuses it.
6. Return with Show nearby and compare the previous camera, selection, and list
   scroll position.
7. Start and exit Directions from each view and confirm the correct originating
   view returns.
8. Remove the final item and verify the empty state remains usable.
9. Seed a missing ID and verify it is explained and removable.
10. Verify the map-marker matrix and keyboard-accessible labels.
11. Verify an initial Nearby list has no list-level Directions, Share, or Save
    actions before explicit selection.
12. Select a Nearby row and verify it alone exposes inline Directions and More;
    verify More contains Save/remove first and Share second, then select another
    row and ensure the action cluster moves without leaving blank space.
13. Save the selected row, select another row, and verify the first row shows a
    non-interactive saved-status glyph but no bookmark button.
14. Open My neuks and verify unselected rows have no action controls or repeated
    bookmark indicators; selecting one reveals Directions and More, whose menu
    starts with Remove from My neuks.
15. Use the keyboard to select a row, Tab to Directions and More, open the menu,
    and verify focus enters it. Verify Escape closes it and returns focus to
    More.

Run the mobile cases at the existing Pixel 5 profile and explicitly review a
390 x 844 viewport with `?mockGps=55.9533,-3.1883,5`. Check expanded and
collapsed sheets, the selected row near the bottom of the list, no horizontal
overflow, and a clean browser console. Repeat the core flow on desktop and in
light and dark themes.

### Commands

Use the narrowest check while developing, then run the full gate:

```sh
pnpm test
pnpm lint
pnpm format
pnpm build
pnpm test:e2e
```

## Remaining delivery sequence

1. **Action-state semantics** — make explicit selection the only condition that
   reveals list actions; keep closest-row styling independent from selection.
2. **Shared inline actions** — make Directions the leading text action and group
   Save/remove and Share inside a More menu used by selected Nearby and My neuks
   rows.
3. **Passive saved status** — add the quiet bookmark indicator to saved,
   unselected Nearby rows while preserving the directly removable missing-row
   exception.
4. **Responsive CSS cleanup** — remove permanent action columns and nested
   containers, style the inline selected actions at mobile and desktop
   breakpoints, and verify 44 px targets, menu stacking, and translated labels.
5. **Interaction and accessibility tests** — cover initial, selected, moved,
   saved, My neuks, missing-record, and keyboard-focus states.
6. **Regression verification** — run unit, lint, format, build, and Playwright
   checks; then review 390 x 844 and desktop surfaces in light and dark themes.

## Acceptance criteria

- A saved neuk survives reload in the same browser profile.
- Nearby remains the launch view and has no permanent view tabs.
- An initial Nearby list has no list-level actions until a row is explicitly
  selected.
- Only the explicitly selected Nearby or My neuks row exposes primary
  Directions and More; More contains Save/remove followed by Share.
- Saved, unselected Nearby rows show status without exposing another action;
  unselected My neuks rows repeat neither actions nor bookmark indicators.
- The closest-row treatment does not imply selection or reveal actions.
- A saved ranked pin keeps its number and gains a bookmark badge.
- An unranked saved neuk visible on the Nearby map uses a bookmark pin.
- My neuks opens inside the current sheet/sidebar without an initial camera
  change or URL change.
- My neuks rows have no ranks and do not repeat a visible bookmark label or
  persistent action column.
- The My neuks map shows saved pins only and can navigate to a distant saved
  neuk.
- Show nearby restores the previous Nearby camera, selection, and scroll state.
- Directions exits back to the view from which it was launched.
- Empty, missing-record, corrupt-storage, and storage-failure states are
  understandable and recoverable.
- English, Gaelic, and Spanish interfaces remain complete.
- Keyboard, screen-reader, reduced-motion, mobile, desktop, light, and dark
  behaviours pass the stated verification.
- The app remains a backend-free static export.
