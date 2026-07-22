# Bike neuk details redesign plan

## Status

Implemented and locally verified on 2026-07-22. The shipped implementation
keeps the sheet content-sized, uses a details-only 68dvh ceiling so the fitted
view does not scroll in an iPhone 13 Safari viewport, and retains a scrollable
fallback for genuinely short viewports.

This plan defines the selected mobile details design and supersedes the details
surface described in `MOBILE_INTERACTION_CONSOLIDATION_PLAN.md`. The existing
panel reducer, content-height measurement, map-camera coordination, and return
behaviour remain authoritative.

## Product decision

Make the mobile details sheet more compact and visual without adding another
view or navigation state:

- Keep Back on the left of the top toolbar.
- Move Save and Share to compact icon buttons on the right of that toolbar.
- Keep the neuk name and distance immediately below the toolbar.
- Replace the full-width fact strip with a split overview: facts on the left and
  a small Street View preview on the right.
- Make the preview non-interactive except for one full-size tap target that
  opens the existing large Street View dialog.
- Replace the old Street action with a Google Maps action that opens the neuk's
  coordinates as a location in Google Maps.
- Put Google Maps on the left and Directions, the primary action, on the right.
- End the sheet directly after the action row, with only the compact bottom and
  device safe-area inset required to avoid clipping.

The nearby list, selected-pin popup, full Street View dialog, directions view,
and desktop presentation stay visually and behaviourally unchanged.

## Goals

1. Let someone judge the parking type, capacity, cover, and physical setting at
   a glance.
2. Keep Directions as the strongest action while making Google Maps easy to
   reach.
3. Remove the redundant bottom Share and Save actions without losing their
   discoverability, state, or accessibility.
4. Reduce sheet height and unnecessary bottom whitespace so more of the map
   remains visible.
5. Reuse the existing Maps Embed key and large Street View dialog rather than
   adding a dependency or enabling another Google API.
6. Preserve the current mobile panel navigation, measurement, animation, and
   map-camera contracts.

## Non-goals

- Redesigning the nearby or My neuks lists.
- Changing the selected-pin popup or its existing Street action.
- Redesigning the large Street View dialog.
- Changing directions calculation, live-route behaviour, or location handling.
- Enabling the Street View Static API or adding another Google credential.
- Changing parking data, naming, ranking, saved-neuk persistence, or sharing.
- Changing desktop layout beyond a regression-safe styling adjustment.
- Installing dependencies, deploying, committing, or pushing as part of this
  plan.

## Current implementation

- `src/components/cycle-parking-finder.tsx` renders the mobile details body,
  fact strip, four bottom actions, and the shared Street View dialog.
- `ParkingDetailStrip` is also used outside this details surface. Its list,
  popup, and directions behaviour should not be changed incidentally.
- `src/app/globals.css` gives the details body a mobile gap, gives the current
  actions additional bottom padding, and styles the existing content-sized
  sheet.
- The content-height `ResizeObserver` measures the last visible details child
  and clamps the expanded sheet to 52dvh. The redesigned action row should
  remain that last child so the shorter layout is measured automatically.
- `src/lib/street-view.ts` already builds the Maps Embed URL and a currently
  unused Google Maps Street View URL.
- `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY` is restricted to Maps Embed API use.
  A keyless Google Maps URL must be used for the new external action.
- `src/lib/i18n/messages.ts` carries English, Scottish Gaelic, and Spanish
  catalogues with compile-time catalogue parity.
- `e2e/mobile.spec.ts` already protects detail sheet sizing, long names, action
  placement, Save stability, tall viewports, navigation, and reduced motion.

## Interaction contract

| Control             | Result                                            | State and motion                                                                               |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Back                | Return to the originating Nearby or My neuks list | Preserve selection, popup, scroll, and existing reverse transition                             |
| Save                | Toggle membership in My neuks                     | Keep `aria-pressed`, icon fill, announcement, focus, sheet height, and scroll position stable  |
| Share               | Copy the existing neuk link                       | Keep the live status message and do not move the details layout                                |
| Street View preview | Open the existing large Street View dialog        | Reuse `streetViewPoint`, dialog animation, close behaviour, and `street_view_opened` analytics |
| Google Maps         | Open the neuk coordinates in Google Maps          | Native external link; do not require an API key or change panel state                          |
| Directions          | Open the existing cycle directions view           | Preserve the existing request, loading, analytics, return origin, and forward transition       |

## Proposed implementation

### 1. Add a general Google Maps location URL

- Keep `src/lib/street-view.ts` to avoid a file rename with little product
  value, but replace the unused `buildGoogleStreetViewMapsUrl` helper with a
  clearly named `buildGoogleMapsLocationUrl` helper.
- Build
  `https://www.google.com/maps/search/?api=1&query=<latitude>,<longitude>`
  with `URLSearchParams` so the coordinates are encoded consistently.
- Use a normal anchor for the details action so mobile platforms can hand the
  URL to the Google Maps app when available.
- Add `target="_blank"` and `rel="noreferrer"` so opening Google Maps preserves
  the current Bike Neuks details context.
- Update `src/lib/street-view.test.ts` to assert the search path, `api=1`, and
  exact coordinate query. Google documents Maps URLs as cross-platform and
  keyless: <https://developers.google.com/maps/documentation/urls/get-started>.

### 2. Restructure the details toolbar and utilities

- Replace the standalone Back button with a `.parking-details-toolbar` row.
- Keep Back left aligned and add a `.parking-details-utilities` group on the
  right containing Save, then Share, matching the selected mockup.
- Render utilities as 44-by-44-pixel icon buttons with the existing Bookmark
  and Share icons, hover/focus treatment, and motion tap feedback.
- Preserve the full accessible Save/Remove and Copy Link names even though the
  visible text labels are removed.
- Keep the saved icon fill and `aria-pressed` state. Keep copied, saved, error,
  and removal feedback in the existing live status regions below the heading
  or overview without reserving empty height when no message is present.

### 3. Build the split facts and Street View overview

- Add a detail-specific overview wrapper rather than changing the default
  `ParkingDetailStrip` layout used by lists, popups, and directions.
- Render all available detail facts in a compact vertical stack on the left:
  capacity first and more prominent, followed by type, cover, and access when
  present.
- Preserve translated values, unknown/not-listed handling, existing detail
  icons, and the source data order returned by `getParkingPopupDetails`.
- When the Embed key is present, render a right-side preview with a stable
  aspect ratio, rounded crop, loading background, and subtle expand icon.
- Reuse `buildGoogleStreetViewEmbedUrl` in a lazy iframe. Make the iframe
  non-interactive in the thumbnail (`pointer-events: none`, removed from the
  tab order, and hidden from the accessibility tree) and place one semantic
  button over the entire preview.
- Give the overlay button the existing translated
  `Open Street View for {name}` accessible name. Its click handler sets
  `streetViewPoint` and captures the existing `street_view_opened` event.
- If no Embed key is configured, omit the preview entirely and let the facts
  use the full overview width. Google Maps and Directions remain available.
- Do not add a Street View Static API request. That would require enabling a
  second API and changing the current browser-key restriction.

### 4. Replace and reorder the main actions

- Replace `.parking-detail-actions` with a two-column primary action row.
- Render Google Maps first on the left as an outlined secondary anchor with an
  External Link or Map Pin icon.
- Render Directions second on the right as the filled accent action with the
  Navigation icon.
- Keep both controls at least 44 pixels high, allow translated labels to wrap
  safely, and keep their borders/focus outlines inside the measured sheet.
- Add translated `googleMaps` and `openInGoogleMaps` messages to English,
  Scottish Gaelic, and Spanish catalogues.
- Capture a `google_maps_opened` analytics event from the link activation with
  the parking ID, name, and `source: 'details'` while leaving the event as a
  no-op when analytics is disabled.

### 5. Tighten spacing and bottom inset

- Scope the visual redesign to the existing mobile details surface wherever
  possible.
- Reduce the details body's vertical gap while retaining clear grouping around
  the toolbar, heading, overview, status message, and action row.
- Remove the current details-action `padding-bottom: 0.4rem`; rely on the
  control pane's `max(0.5rem, env(safe-area-inset-bottom))` padding for the
  final device-safe inset.
- Do not add `margin-top: auto`, a flex spacer, a fixed sheet height, or an
  empty footer beneath the actions.
- Keep the action row as the final visible child so the existing content-height
  measurement ends at its lower border plus the pane inset.
- Maintain a 0–16-pixel action-to-pane-bottom gap on an ordinary 390-by-844
  viewport, while allowing a larger inset only when the device reports a larger
  safe-area requirement.
- Add a narrow-phone rule only if necessary to keep the facts and preview
  legible; prefer slightly narrower columns and wrapped labels over hiding
  facts or actions.

### 6. Preserve modal and panel behaviour

- Keep the existing `streetViewPoint` state and `<dialog>` implementation as
  the only large Street View path.
- Keep the preview trigger and modal iframe semantics distinct so assistive
  technology encounters only the actionable preview and the open dialog.
- Confirm closing the dialog restores focus to the preview trigger without
  scrolling the sheet.
- Do not add a panel reducer event for preview, Save, Share, or Google Maps;
  none of these actions creates a new panel view.
- Leave the content-height observer intact unless browser verification exposes
  iframe-load movement. If it does, reserve the preview's dimensions in CSS so
  loading cannot resize the sheet.

### 7. Align documentation with the new contract

- Update the details-surface wording in
  `MOBILE_INTERACTION_CONSOLIDATION_PLAN.md` during implementation so it no
  longer lists Street, Share, and Save as four bottom actions.
- Update README configuration text only if the implementation changes how the
  existing Embed key is used. No new environment variable should be added.

## Accessibility requirements

- Every toolbar, preview, and primary action target is at least 44 by 44 pixels.
- Save retains `aria-pressed`; Share and Google Maps retain specific names that
  include the neuk name where useful.
- The decorative preview iframe cannot capture keyboard, pointer, or swipe
  input; the overlay button is the only thumbnail interaction.
- The preview button has a visible focus outline that is not clipped by the
  rounded thumbnail.
- The external Google Maps action is a real link and has a visible external
  affordance.
- Status announcements remain available without introducing layout movement.
- The large dialog keeps its labelled heading, close control, backdrop close,
  Escape behaviour, and reduced-motion support.
- Long English, Gaelic, and Spanish labels wrap without overlapping icons or
  reducing touch-target size.

## Verification plan

### Unit and static checks

1. Run `pnpm test src/lib/street-view.test.ts` while changing URL helpers.
2. Run `pnpm test` for the full unit suite.
3. Run `pnpm lint`.
4. Run `pnpm format`.
5. Run `pnpm build` because the main client component and static export surface
   change.

### Focused browser coverage

Extend `e2e/mobile.spec.ts` to verify:

1. The toolbar contains Back, Save, and Share, and Save/Share no longer appear
   in the bottom action row.
2. The overview places facts and the preview side by side when the Embed key is
   available.
3. Tapping the preview opens the existing Street View dialog; closing it
   returns focus without changing sheet scroll or height.
4. The Google Maps href uses the selected neuk coordinates and appears before
   Directions in DOM and visual order.
5. Google Maps remains present and the facts expand cleanly when no Embed key
   is configured.
6. Directions still opens the route view and exits back to details.
7. Saving and sharing do not move the sheet, scroll the body, or clip focus
   outlines.
8. The final action row sits inside the pane with no more than 16 pixels of
   ordinary bottom gap, while safe-area overrides remain valid.
9. Short and long names, one through four facts, 390-by-844, a shorter phone,
   and a 390-by-1000 viewport remain content-sized and usable.
10. English, Scottish Gaelic, and Spanish labels remain legible.
11. Reduced-motion mode preserves every interaction and state change.

Use the production static export through
`.agents/skills/manual-test/scripts/serve-static-export.sh`, beginning with:

`http://127.0.0.1:4181/?mockGps=55.9533,-3.1883,5`

Run the focused mobile Playwright file while iterating, then run
`pnpm test:e2e` before considering the change complete.

### Manual visual checks

- Compare the rendered 390-by-844 details sheet with the selected mockup.
- Confirm the sheet ends immediately after Google Maps and Directions on a
  device without an additional safe-area inset.
- Confirm a real bottom safe area is respected on an iPhone-sized viewport.
- Confirm the preview loads without shifting the sheet and remains obviously
  tappable without looking like a third primary action.
- Confirm the map retains materially more visible space than the current
  details design.
- Confirm the selected-pin popup and desktop list/popup are unchanged.

## Completion criteria

The redesign is complete when:

- facts and Street View form one compact split overview;
- the preview opens the existing large dialog and requires no new API;
- Save and Share appear only in the top toolbar and retain their current state
  and announcements;
- Google Maps opens the selected coordinates, sits left of Directions, and is
  available without the Embed key;
- Directions remains the primary action and returns correctly;
- the action row is the sheet's final content with no avoidable bottom gap;
- sheet height, scrolling, focus, reduced motion, and map-camera behaviour meet
  the existing mobile interaction contract;
- mobile, desktop, and locale browser scenarios pass;
- unit tests, lint, format, build, focused E2E, and full E2E pass; and
- implementation, verification, commit, push, and deployment remain separate
  approval steps.
