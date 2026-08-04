# Local Route Planning Plan

**Status:** Implemented; release verification complete
**Date:** 2026-08-04
**Implementation:** Complete for the first-release scope

## Implementation outcome

The first release now provides the planned map-first route builder, ordered
place and map stops, CycleStreets route alternatives, device-local IndexedDB
storage, a My routes library, offline reopening and GPX export, and translated
copy in all four supported languages.

The implementation uses explicit Move up and Move down controls for accessible
stop reordering rather than introducing a separate drag-and-drop dependency.
Saved-route actions remain directly visible in the compact detail view. The
planner and library entry points now live in the existing Bike Neuks menu so
the normal map and Nearby sheet remain focused on finding parking. These
choices keep the initial mobile workflow simple and can be revisited after
manual testing.

### Verification completed

- Live CycleStreets provider spikes returned Quietest, Balanced, and Fastest
  routes for three-, eight-, and 30-stop requests. The provider rejected 64
  points with its explicit maximum of 30, so the app uses the same limit.
- All 194 focused Vitest tests pass, including route draft, multi-waypoint
  request, IndexedDB record, and GPX generation coverage.
- Formatting, lint, TypeScript, and the production static export pass.
- All 87 desktop and mobile Playwright regression tests pass, including the
  menu-only route entry and reclaimed Nearby-sheet space.
- A production-build browser walkthrough calculated a route, switched route
  style, saved it, reopened it after reload, exported valid GPX, added a third
  stop by tapping the mobile map, and completed without console errors.

## Goal

Add a map-first route planner that lets a cyclist:

1. Build a route from two or more ordered stops.
2. Compare CycleStreets Quietest, Balanced, and Fastest routes.
3. Save the chosen route locally on the current device.
4. Reopen and view saved routes in Neuk.
5. Export a saved route as a GPX file.

This should feel like an extension of the current directions experience, not a
separate route-planning application.

## Recommended product direction

Combine the map-first builder and saved-routes library explored in the design
options:

- Use a compact map-first builder for the normal planning flow.
- Expand an ordered stop editor only when the cyclist needs to add, remove, or
  reorder stops.
- Use a dedicated **My routes** view for reopening, renaming, duplicating,
  deleting, and exporting saved routes.
- Keep the existing parking-place **Directions** action as the fast path from
  the current location to one neuk.

### Entry points

Add a compact **Routes** section to the existing Bike Neuks menu:

- **Plan a route** opens a new route draft.
- **My routes** opens the local route library and shows its saved count.

Do not add route controls to the map or normal Nearby sheet. For the first
release, keep the existing **My neuks** action in its current list-heading
location. Do not reorganise unrelated saved-place navigation as part of this
feature.

The **My routes** header and empty state should also include **Plan a route**.

## Scope

### First release

- Ordered routes with a start, finish, and optional intermediate stops.
- Stops added from place search or by deliberately entering an “add stop” map
  mode and tapping the map.
- Current location offered as the default start when available.
- Stop removal and reordering.
- Quietest, Balanced, and Fastest route choices; Balanced remains the default.
- Route name, distance, duration, selected plan, stops, instructions, and
  geometry saved locally.
- **My routes** library with view, rename, duplicate, export, and delete.
- GPX 1.1 track export with named stop waypoints.
- Reopening saved geometry and exporting it without recalculating the route.
- English, Gaelic, Spanish, and Armenian UI copy.
- Desktop and mobile layouts, with the mobile experience remaining map-first.

### Explicitly out of scope

- Accounts, cloud sync, server storage, or cross-device route links.
- Sharing a Neuk URL that recreates a locally saved route on another device.
- GPX import.
- Freehand route drawing or editing individual geometry points.
- Dragging the calculated route line to force it onto another road.
- Automatic optimisation of waypoint order.
- Public route discovery, social features, or collaborative editing.
- Turn-by-turn voice guidance.
- Round-trip route generation as a separate mode.

These exclusions keep the first release compatible with the static,
backend-free deployment and the existing CycleStreets integration.

## Existing foundations

The app already has most of the difficult display and navigation primitives:

- `src/lib/cyclestreets.ts` requests and parses CycleStreets routes, including
  Quietest, Balanced, and Fastest alternatives.
- `src/components/cycle-parking-map.tsx` renders route geometry, focuses route
  bounds, displays instruction focus, and supports live route progress.
- `src/components/cycle-parking-finder.tsx` owns the current directions panel,
  route-choice state, request cache, live tracking, search, and responsive
  panel transitions.
- `src/lib/geocoder.ts` already returns named coordinates suitable for route
  stops.
- `src/lib/saved-neuks.ts` establishes the local-first storage/error handling
  conventions, although saved route geometry needs a larger storage mechanism.
- `src/lib/parking-panel.ts` provides the existing list, details, and
  directions navigation state machine.
- `e2e/common-workflows.spec.ts` and `e2e/mobile.spec.ts` cover the existing
  directions experience that must not regress.

## User experience

### 1. Start a route

Selecting **Plan a route** opens a draft with:

- Current location as the proposed start when a resolved location exists.
- An empty finish row prompting the cyclist to search or tap the map.
- Balanced selected as the initial route style.
- The map still visible as the primary context.

If location is unavailable, both start and finish begin empty. The route
planner must not silently use the Edinburgh fallback as a real route stop.

### 2. Add and edit stops

Each stop contains a stable ID, display label, latitude, longitude, and source.
A cyclist can:

- Search for a place using the existing Photon flow.
- Choose a saved neuk or visible parking point where the UI naturally offers
  it.
- Select **Add stop**, then tap the map to place it deliberately.
- Remove an intermediate stop.
- Reorder stops using a touch-friendly drag interaction with keyboard and
  Move up/Move down alternatives.
- Swap start and finish.

The map must not add stops on ordinary taps. Map-tap placement is active only
after the cyclist selects **Add stop** or chooses an empty stop row.

Changing stop order or coordinates marks the route stale and triggers a
debounced recalculation. Existing geometry remains visible in a subdued state
until the new route succeeds, avoiding a blank-map flash.

### 3. Choose and save

Once CycleStreets returns route alternatives, show the existing compact
Quietest/Balanced/Fastest selector with time and distance.

Saving should:

- Require a successfully calculated route with at least two distinct stops.
- Offer a useful default name derived from the first and last named stops.
- Resolve “Current location” to the fixed coordinates used for calculation;
  reopening the saved route must not move its start to the cyclist's new
  location.
- Save only the selected plan's full route data. Other plans can be
  recalculated when the route is edited.
- Return to the route detail view with clear “Saved on this device” feedback.

If the cyclist exits with meaningful unsaved changes, ask whether to discard
the draft. Do not show that confirmation for an untouched draft.

### 4. My routes

The library is a normal control-panel view. Selecting a route:

- Draws its saved geometry on the map.
- Fits the map to the route.
- Shows its name, saved date, distance, duration, and route style.
- Offers **View route** and **Export GPX**.
- Provides rename, duplicate, and delete in an overflow menu.

Render only the selected saved route on the map in the first release. Showing
every saved geometry at once adds map clutter, increases IndexedDB reads, and
requires a separate multi-route rendering model.

Opening **View route** uses the existing directions/instruction presentation
and may offer **Start route** through the current live-tracking code. Editing
is an explicit action that creates a draft from the saved route.

### 5. Offline behaviour

When the network is unavailable:

- Saved route geometry, summary, instructions, and stop names remain
  available from local storage.
- GPX export remains available.
- Recalculation, route-style switching, and place search explain that a
  connection is required.
- Map tiles follow the app's existing cache behaviour; do not promise that the
  complete background map is available offline.

## Routing integration

### Phase-zero CycleStreets spike

Before building production UI, verify the current CycleStreets v2 contract
with the configured development key. The public CycleStreets planner supports
waypoints, but Neuk currently sends exactly two points.

The spike must establish:

1. The accepted v2 encoding for three or more ordered waypoints.
2. The practical waypoint limit and any route-distance limit.
3. Whether one request can still return all three plans.
4. Whether route geometry and instructions remain correctly ordered across
   waypoint boundaries.
5. Whether named waypoints change the response shape.
6. URL-length and JSONP behaviour for the browser-only request path.
7. Behaviour in each of Neuk's supported routing areas.
8. Attribution, archive, or API-usage conditions relevant to saving the
   returned geometry locally.

Record the request/response shape in focused fixtures, but do not commit an API
key or personal route data.

If the endpoint cannot return reliable multi-waypoint routes, use a documented
fallback: request each consecutive leg separately, then combine the selected
plan's geometry, instructions, distance, and duration. This costs one request
per leg and should therefore have a conservative stop limit. Do not silently
mix route styles between legs.

### Domain refactor

Decouple routing from `ParkingPoint`. Introduce a generic waypoint type and
adapt the existing parking-directions action to it:

```ts
type CycleRouteWaypoint = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  source: 'current-location' | 'map' | 'parking' | 'search' | 'saved-route';
};
```

Update `buildCycleStreetsDirectionsRequest` to accept an ordered array with at
least two waypoints. Update the cache key to include:

- Every waypoint coordinate in order.
- The complete set of requested plans.
- Routing speed and any other route-affecting option.

Preserve the current two-point parking directions behaviour through a small
adapter and keep its existing tests.

The parser should identify start, intermediate, and final arrival boundaries
without inferring semantics from translated instruction strings.

## Local persistence

### Storage choice

Use native IndexedDB for saved routes rather than `localStorage`.

The app currently uses `localStorage` for compact saved-neuk snapshots, but a
route may contain hundreds or thousands of geometry points plus instructions.
Saving complete routes in `localStorage` would consume its small synchronous
quota quickly and could slow startup parsing.

No new runtime dependency is required. Wrap IndexedDB behind a focused module
so UI components never call it directly.

### Versioned record

Create `src/lib/saved-routes.ts` with a versioned, runtime-validated record:

```ts
type SavedRouteRecord = {
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  plan: CycleRoutePlan;
  waypoints: CycleRouteWaypoint[];
  distanceMeters: number;
  durationSeconds: number;
  points: CycleRoutePoint[];
  instructions: CycleRouteInstruction[];
  source: 'cyclestreets' | 'local';
  providerItineraryId?: string;
  providerRouteUrl?: string;
};
```

Required persistence operations:

- List route summaries without first rendering every geometry.
- Read one complete route by ID.
- Create and update a route.
- Rename and duplicate a route.
- Delete a route.
- Report unavailable storage, invalid records, and quota failures without
  losing the active draft.

Sort routes by `updatedAt` descending. Treat invalid records as unreadable and
leave room for a future migration rather than partially trusting malformed
geometry.

The UI must clearly state that routes are saved on this device and can be lost
if site data is cleared. GPX export is the first-release backup/transfer path.

## GPX export

Add `src/lib/gpx.ts` with a dependency-free GPX 1.1 serializer.

Export the calculated path as a `<trk>` with one `<trkseg>` and ordered
`<trkpt>` elements. Also emit each named route stop as a `<wpt>` so compatible
devices can display the planned stops.

Requirements:

- Preserve latitude/longitude precision without swapping Neuk's internal
  `[latitude, longitude]` tuple order.
- XML-escape the route name and waypoint labels.
- Include creator, route name, and export timestamp metadata.
- Use a sanitised, human-readable `.gpx` filename.
- Generate a browser `Blob`, trigger the download, and always revoke its object
  URL.
- Do not add proprietary extensions in the first release.
- Prefer a track over a GPX route as the primary geometry because it imports
  more consistently across cycling computers and route services.

GPX export must use saved geometry and must not make a CycleStreets request.

## Component and state changes

Avoid adding the whole feature inline to the already large
`cycle-parking-finder.tsx`. Introduce focused components and pure libraries:

- `src/components/route-planner.tsx` — draft creation, route-style selection,
  save, and unsaved-change handling.
- `src/components/route-stop-editor.tsx` — ordered stop rows, search insertion,
  remove, swap, and accessible reorder controls.
- `src/components/saved-routes-panel.tsx` — library and selected-route actions.
- `src/lib/route-draft.ts` — pure draft transitions, validation, names, and
  stale/recalculation rules.
- `src/lib/saved-routes.ts` — IndexedDB repository and record validation.
- `src/lib/gpx.ts` — GPX serialisation and download helpers.

Extend `src/lib/parking-panel.ts` or replace it with a more general app-panel
state only after adding reducer tests for the new transitions. Required new
views are conceptually:

- `route-planner`
- `saved-routes`
- `saved-route-details`

The map needs explicit route-planning props rather than inferring builder mode
from the presence of geometry:

- Ordered waypoint markers.
- The active “place a stop” mode.
- A callback for deliberate map placement.
- Saved/draft route geometry and a stale visual state.

Parking markers and National Cycle Network layers can remain visible but
should not intercept a deliberate stop-placement tap.

## Localisation, accessibility, and privacy

### Localisation

Add every new message key to all four catalogues in
`src/lib/i18n/messages.ts`. This includes empty states, stop roles, storage and
offline errors, rename/delete confirmation, GPX actions, and route-draft
feedback.

Check long Gaelic and Armenian labels at 390 px. Do not construct translated
sentences by concatenating fragments.

### Accessibility

- Stop rows expose their order and role to assistive technology.
- Reordering has keyboard-operable Move up/Move down controls even if pointer
  dragging is also implemented.
- Map placement has an equivalent search/coordinate-independent path.
- Focus moves predictably when views open, a stop is added, or a dialog closes.
- Delete requires confirmation or a recoverable undo.
- Status and error messages use appropriate live regions without repeatedly
  announcing background recalculations.

### Analytics and privacy

Add coarse product events such as:

- `route_planner_opened`
- `route_calculated`
- `route_saved`
- `saved_route_opened`
- `route_gpx_exported`
- `saved_route_deleted`

Properties may include stop count, selected plan, rounded distance band,
source view, and success/failure reason. Never send route names, stop labels,
coordinates, full distances precise enough to identify a route, or GPX data to
PostHog.

## Delivery phases

### Phase 0 — provider proof

- Run the CycleStreets multi-waypoint spike.
- Capture sanitised fixtures for supported and failure responses.
- Decide direct multi-waypoint versus per-leg fallback.
- Set and document the first-release stop limit.

**Gate:** Do not build the route editor until the provider path and stop limit
are known.

### Phase 1 — route domain, storage, and export

- Introduce generic route waypoints.
- Refactor the two-point directions adapter without changing its UX.
- Implement draft transitions and validation.
- Implement IndexedDB persistence.
- Implement GPX serialisation and download.
- Add focused unit tests.

**Gate:** Existing directions tests and all new pure-library tests pass.

### Phase 2 — map-first builder

- Add the Nearby-screen entry point.
- Build the compact route planner and expanded stop editor.
- Add search and deliberate map-tap insertion.
- Add waypoint markers, stale geometry, route recalculation, and route choices.
- Save a named selected route.
- Verify mobile interaction at 390 x 844 before desktop polish.

**Gate:** A cyclist can build, reorder, calculate, and save a multi-stop route
without affecting the current parking-directions flow.

### Phase 3 — My routes and reopening

- Add the route library and empty state.
- Render a selected saved route on the map.
- Open saved instructions and existing live tracking.
- Add rename, duplicate, delete, edit, and GPX export.
- Add storage/offline/error states.

**Gate:** A saved route survives reload, opens without recalculation, and
exports while route services are offline.

### Phase 4 — localisation and release proof

- Complete all four translations and a natural-language review.
- Add analytics without route-identifying properties.
- Add route-planning E2E coverage on desktop and mobile.
- Update `README.md` with route storage, offline, GPX, and CycleStreets notes.
- Run `pnpm test`, `pnpm lint`, `pnpm format`, `pnpm build`, and the relevant
  Playwright suite.
- Verify static export behaviour and production deployment separately if the
  implementation is approved for release.

## Test plan

### Unit tests

- Multi-waypoint request encoding and ordered cache keys.
- Existing two-point parking request compatibility.
- Parser behaviour at intermediate waypoint boundaries.
- Draft add/remove/reorder/swap and stale-route transitions.
- Default route names and Unicode labels.
- IndexedDB record validation, ordering, update, duplicate, and failure paths.
- GPX coordinates, ordering, XML escaping, metadata, filename, and empty-route
  rejection.
- Panel reducer transitions and return destinations.

### Browser tests

- The Bike Neuks menu exposes **Plan a route** and **My routes**, while the
  normal Nearby sheet and map have no route entry controls.
- Current location becomes a fixed saved start coordinate.
- Search adds a finish and intermediate stop.
- Deliberate map placement adds one stop; ordinary map taps do not.
- Reordering recalculates the route and preserves stop order.
- Quietest/Balanced/Fastest switching remains available before live tracking.
- Save, reload, reopen, rename, duplicate, and delete.
- GPX download has a `.gpx` filename and expected MIME/content.
- Saved route opens and exports with route/search requests blocked.
- Storage failure retains the draft and shows actionable feedback.
- 390 x 844 builder/library states have no page overflow and preserve useful
  map context.
- Gaelic, Spanish, and Armenian layouts remain usable.
- Existing simple parking directions, live tracking, My neuks, map selection,
  and sharing tests still pass.

## Acceptance criteria

The first release is complete when:

1. A cyclist can create an ordered route of at least two stops using search or
   deliberate map placement.
2. The route follows one consistent CycleStreets plan and displays valid
   geometry, distance, duration, and instructions.
3. The cyclist can reorder stops accessibly and see a recalculated route.
4. Saving stores a fixed, versioned local snapshot of the selected route.
5. Saved routes survive a reload and are clearly labelled as device-local.
6. A saved route can be viewed and exported to a valid GPX file without a
   network request.
7. Existing current-location-to-parking directions behave as before.
8. The feature is usable at 390 x 844 and on the existing desktop layout in all
   supported locales.
9. No route coordinates, names, stop labels, or geometry are sent to analytics
   beyond the CycleStreets request required to calculate the route.
10. Unit, lint, formatting, static build, and relevant E2E gates pass.

## Rough effort

After the provider spike, this is a medium-to-large feature rather than a small
extension:

- Provider spike and domain refactor: 1–2 focused engineering days.
- Builder, map waypoint interaction, and responsive UI: 2–3 days.
- IndexedDB library, reopening, and GPX export: 1–2 days.
- Localisation, accessibility, regressions, and browser QA: 1–2 days.

Allow roughly **5–9 focused engineering days**, with the largest uncertainty
being CycleStreets multi-waypoint behaviour and accessible mobile reordering.
Freehand editing or GPX import would be separate follow-up projects.

## Approval checkpoint

No production implementation should begin from this document alone.

Before implementation, approve or adjust:

1. The waypoint-based first-release scope and explicit exclusions.
2. IndexedDB as the local route store.
3. The Nearby-screen entry points and separate **My routes** library.
4. GPX track export with named stop waypoints.
5. The provider spike as Phase 0 and the resulting stop limit.

Once those are approved, begin with Phase 0 and return with the verified
CycleStreets contract before committing to the full editor implementation.
