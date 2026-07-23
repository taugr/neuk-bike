# Design QA

## Previous mobile interaction consolidation baseline

### Reference and implementation

- Browse reference: `/Users/tomauger/.codex/generated_images/019f73d4-6605-7691-a394-4a1585cfe62b/exec-d6eabd31-b885-4ff6-9005-8b156751d52b.png`
- Detail reference: `/Users/tomauger/.codex/generated_images/019f73d4-6605-7691-a394-4a1585cfe62b/exec-7b2bbc92-e8ba-4510-b88e-a4b8352525b1.png`
- Browse implementation: `/Users/tomauger/.codex/visualizations/2026/07/18/019f73d4-6605-7691-a394-4a1585cfe62b/implementation-popup.png`
- Detail implementation: `/Users/tomauger/.codex/visualizations/2026/07/18/019f73d4-6605-7691-a394-4a1585cfe62b/implementation-details.png`
- Desktop implementation: `/Users/tomauger/.codex/visualizations/2026/07/18/019f73d4-6605-7691-a394-4a1585cfe62b/desktop-restored.png`
- Final mobile implementation: `/Users/tomauger/.codex/visualizations/2026/07/18/019f73d4-6605-7691-a394-4a1585cfe62b/mobile-popup-details-final.png`
- Content-sized mobile detail: `/Users/tomauger/.codex/visualizations/2026/07/18/019f73d4-6605-7691-a394-4a1585cfe62b/mobile-content-sized-detail-final.png`
- Final desktop regression: `/Users/tomauger/.codex/visualizations/2026/07/18/019f73d4-6605-7691-a394-4a1585cfe62b/desktop-popup-unchanged-final.png`
- Browse comparison: `/Users/tomauger/.codex/visualizations/2026/07/18/019f73d4-6605-7691-a394-4a1585cfe62b/compare-browse.png`
- Detail comparison: `/Users/tomauger/.codex/visualizations/2026/07/18/019f73d4-6605-7691-a394-4a1585cfe62b/compare-details.png`
- Viewport: 390 x 844

### States checked

- Nearby list with no selection.
- Nearby list with an explicitly selected row, compact popup, and contextual
  View details and Directions actions.
- Full parking detail sheet with the selected popup retained on the map.
- Back from full details to the same nearby list context.
- My Neuks list, full saved-neuk details, and Back to My Neuks.
- Desktop selected row, full popup, and inline actions at 1280 x 800.
- Mobile-details-to-desktop resize restores the desktop list automatically.
- Direct mobile pin selection opens the full detail sheet while retaining its compact map popup.
- One-, two-, three-, and four-fact detail strips, including public access when known.

### Comparison findings

- P0: none.
- P1: none.
- P2: none after the final spacing and detail-strip pass.
- The mobile browse list keeps unselected rows compact. Selecting a row reveals
  only View details and Directions so several neuks can be compared without
  immediately replacing the list.
- Desktop deliberately retains the previous inline row actions and full popup because the wider layout has enough space for both.
- The implementation deliberately retains the compact popup in the detail state because that was the final requested change after the detail mockup.
- Actual parking names and values replace the mock data while preserving the reference hierarchy, spacing, icon treatment, borders, and action layout.

### Functional checks

- On mobile, a marker selects the pin and opens the dedicated detail sheet immediately.
- The compact popup exposes capacity, type, and cover only.
- A list row selects and previews the neuk while keeping the list visible; its
  contextual View details action opens the dedicated detail sheet.
- The detail sheet contains Directions, Street, Share, and Save controls.
- Full details include access when known and distribute partial fact sets evenly.
- Circular action controls are visually distinct from the static fact strip.
- Compact popup facts are centred so wrapped cover labels remain balanced.
- The mobile detail sheet measures its content instead of reserving a fixed percentage of tall screens.
- Back restores the source list and keeps the selected pin and popup visible.
- On desktop, selecting a row retains the list, reveals Directions and More actions, and opens the previous full popup with Directions, Street, Share, and Save.
- No browser errors or warnings were recorded during the tested flow.

### Iteration history

1. Replaced the action-heavy popup with a compact three-fact preview.
2. Added the dedicated detail sheet and exact Back behavior.
3. Removed inline list actions to prevent a combined selected-and-nearby state.
4. Tightened the full-detail header and unified the three facts into one divided strip.
5. Removed programmatic pointer-focus styling and checked mobile and desktop containment.
6. Scoped the compact popup and dedicated detail sheet to mobile, restoring the previous desktop popup and selected-row actions.
7. Made mobile pin selection direct, removed the redundant popup chevron, added full access details, and tightened the sheet and action hierarchy.
8. Centred compact popup facts and made the detail sheet content-sized with a short-screen cap.
9. Changed mobile list-row taps into an explicit preview state with View details
   and Directions, while retaining direct pin-to-details behaviour.
10. Gave list navigation and direct pin replacement distinct transitions,
    stabilised list restoration, and coordinated collapsed-sheet pin selection
    into one camera movement.

Previous result: passed

## Bike Neuk details redesign QA

## Comparison setup

- Reference source: `/Users/tomauger/.codex/generated_images/019f88e7-4364-7041-830b-af32861fd063/exec-44d69452-aa04-486a-81fd-43b48f7a5fbc.png`
- Implementation capture: `/Users/tomauger/.codex/visualizations/2026/07/22/019f88e7-4364-7041-830b-af32861fd063/neuk-details-compact-actions-mobile.png`
- Combined comparison: `/Users/tomauger/.codex/visualizations/2026/07/22/019f88e7-4364-7041-830b-af32861fd063/neuk-details-comparison-compact-actions.png`
- Reduced Safari viewport capture: `/Users/tomauger/.codex/visualizations/2026/07/22/019f88e7-4364-7041-830b-af32861fd063/neuk-details-iphone13-compact-actions.png`
- Collapsed summary implementation: `/Users/tomauger/.codex/visualizations/2026/07/22/019f88e7-4364-7041-830b-af32861fd063/neuk-details-collapsed-comfortable-padding.png`
- Collapsed summary before/after comparison: `/Users/tomauger/.codex/visualizations/2026/07/22/019f88e7-4364-7041-830b-af32861fd063/neuk-details-collapsed-padding-comparison.png`
- Expand-icon reference: `/Users/tomauger/.codex/generated_images/019f88e7-4364-7041-830b-af32861fd063/exec-93233e7d-8aec-471a-bfcf-0b5322f9f1cc.png`
- Expand-icon implementation: `/Users/tomauger/.codex/visualizations/2026/07/22/019f88e7-4364-7041-830b-af32861fd063/neuk-details-street-view-expand-icon.png`
- Expand-icon focused comparison: `/Users/tomauger/.codex/visualizations/2026/07/22/019f88e7-4364-7041-830b-af32861fd063/neuk-street-view-expand-icon-comparison.png`
- Compact grip-spacing comparison: `/Users/tomauger/.codex/visualizations/2026/07/22/019f88e7-4364-7041-830b-af32861fd063/neuk-compact-grip-spacing-comparison.png`
- Viewport: 390 × 844 CSS pixels at device-pixel ratio 2
- Reference density: 853 × 1844 pixels, scaled to the same 390 × 844 comparison size
- State: mobile details pane, selected nearby neuk, expanded content-sized sheet

## Visible comparison evidence

- The implementation preserves the approved top toolbar order: Back on the
  left, Save then Share on the right.
- The heading and distance keep the same hierarchy as the reference while
  allowing the real longer name to wrap safely.
- Capacity, type, and cover facts form the compact left column beside the
  Street View preview slot.
- Google Maps is the left outlined action and Directions is the right filled
  primary action.
- The content-sized sheet has no blank lower section. The measured gap from the
  action row to the sheet bottom is 9.27 CSS pixels, including the pane's safe
  edge spacing.
- The production preview's sheet height is 395 CSS pixels, leaving more of the
  map visible than the reference while preserving the same detail hierarchy.
- A separate focused crop was not needed for the no-scroll pass because the
  combined 780 × 844 comparison shows the complete details pane at its native
  390-pixel CSS width with all typography and controls readable.

## Fidelity surfaces

- Typography: the existing app family, weights, wrapping, and hierarchy remain
  unchanged by the overflow fix and continue to match the approved structure.
- Spacing and layout: the fitted pane retains the 9.27-pixel bottom edge gap,
  395-pixel height, two-column overview, and action alignment without clipping.
- Colors and tokens: surface, accent, separator, and button tokens are unchanged.
- Image quality: the preview frame size and crop slot are unchanged; local
  Street View imagery remains blocked by provider key restrictions as recorded
  below.
- Copy and content: Back, Google Maps, Directions, fact labels, and real parking
  content remain unchanged.

## Interaction and runtime checks

- The Street View preview opens the existing large dialog and the Close control
  returns to the compact details pane.
- Back returns to the nearby list and the same neuk can be reopened.
- Focus styles remain visible after keyboard/dialog focus restoration.
- The Google Maps link contains the selected neuk coordinates and opens in a
  new tab; Directions remains the in-app primary action.
- Focused mobile E2E coverage verifies the action order, URL, preview/dialog,
  Save stability, compact sheet sizing, no-scroll fitted state, short-viewport
  overflow fallback, and collapsed summary.
- At 390 × 844, the details body measures 359 CSS pixels for both `clientHeight`
  and `scrollHeight`, computes to `overflow-y: clip`, and remains at
  `scrollTop: 0` after a 120-pixel scroll gesture.
- At 390 × 664, matching the reduced Safari visual viewport on an iPhone 13,
  the details body also measures 359 pixels for both heights, uses
  `overflow-y: clip`, and remains at `scrollTop: 0` after the same gesture.
- At 390 × 520, the sheet reports genuine content overflow and restores
  `overflow-y: auto` so controls remain reachable rather than clipped.
- The app tab reported no console errors or warnings during the checked flow.
- In the collapsed details state at 390 × 664, the parking name and distance
  now sit 17 CSS pixels inside the pane's left and right edges.

## Findings and history

### Iteration 1

- Passed: structure, spacing, hierarchy, toolbar utilities, fact/preview split,
  action order, touch target sizing, responsive containment, and bottom padding.
- Blocked (P1): the configured Google Maps Embed API key rejects the local
  preview origin, so the Street View imagery is blank in both the new thumbnail
  and the pre-existing large dialog. The iframe source is present and the
  thumbnail-to-dialog interaction works, but the reference imagery cannot be
  visually validated on localhost until that origin is authorized in the key's
  provider settings. This is external configuration, not a console or layout
  regression.

### Iteration 2

- Earlier finding (P2): the fitted details body still used `overflow-y: auto`,
  allowing a small touch or rubber-band scroll even when content and viewport
  heights were equal.
- Fix: the content-height measurement now records whether the 52dvh sheet cap
  actually clamps the content. Fitted details use `overflow-y: clip`; only a
  genuinely clamped short viewport becomes scrollable.
- Post-fix evidence: at 390 × 844, `clientHeight` and `scrollHeight` are both
  372 pixels, the overflow mode is `clip`, a scroll gesture leaves
  `scrollTop: 0`, and the new combined comparison shows no clipping or spacing
  change. The focused mobile E2E set passes both the fitted and 390 × 640
  fallback states.
- The earlier P1 provider-authorization blocker remains unchanged: Street View
  imagery cannot be compared locally, although its frame and interaction work.

### Iteration 3

- Earlier finding (P2): the two bottom actions were still taller than necessary,
  and the shared 52dvh sheet ceiling forced the details body to scroll in an
  iPhone 13 Safari visual viewport even though the content could fit safely.
- Fix: reduced the action height to 46.4 CSS pixels with tighter internal and
  surrounding gaps, shortened the preview slightly, and gave only the details
  state a 68dvh ceiling. The sheet remains content-sized; the larger ceiling is
  used only to avoid clamping otherwise fitted details.
- A one-pixel measurement guard accounts for fractional layout rounding so an
  equal-height body is not misclassified as overflow.
- Post-fix evidence: the live 390 × 664 viewport has equal 359-pixel client and
  scroll heights, no overflow attribute, `overflow-y: clip`, and `scrollTop: 0`
  after a touch-style scroll gesture. Both actions are 46.4 pixels tall. The
  390 × 520 fallback remains scrollable, and the five focused mobile tests pass.
- The earlier P1 provider-authorization blocker remains unchanged: Street View
  imagery cannot be compared locally, although its frame and interaction work.

### Iteration 4

- Earlier finding (P2): the collapsed details summary overrode the panel's
  normal inset with 1.6 pixels of horizontal padding. The parking name began
  2.6 pixels from the viewport edge and the distance ended 2.6 pixels from the
  opposite edge, making the row feel visibly cramped.
- Fix: aligned the collapsed details summary with the panel's existing 16-pixel
  horizontal spacing rhythm while leaving the expanded details layout and the
  86.4-pixel collapsed sheet height unchanged.
- Post-fix evidence: the combined 780 × 664 before/after comparison shows the
  more comfortable inset without changing typography, color, map visibility,
  or summary height. Live measurements place both text edges 17 pixels inside
  the pane, the focused collapsed-summary E2E test passes, and the browser
  reports no console errors or warnings.
- The earlier P1 provider-authorization blocker remains unchanged: Street View
  imagery cannot be compared locally, although its frame and interaction work.

### Iteration 5

- Earlier finding (P2): the Street View thumbnail reused the external-link icon
  from Google Maps even though tapping it expands an in-app view. The selected
  design direction shows diagonal expand arrows for this control.
- Fix: replaced only the thumbnail control with the existing Lucide `Maximize2`
  icon. Google Maps retains its external-link icon, preserving the distinction
  between expansion and external navigation.
- Post-fix evidence: the focused 240 × 120 reference/implementation comparison
  shows the same diagonal expand-arrow metaphor within the circular overlay.
  The refreshed 390 × 664 preview opens and closes the Street View dialog, the
  focused mobile E2E test passes, and the browser reports no console errors or
  warnings.
- The earlier P1 provider-authorization blocker remains unchanged: Street View
  imagery cannot be compared locally, although its frame and interaction work.

### Iteration 6

- Earlier finding (P3): the shared four-pixel body inset left more vertical air
  than needed between the grip and the first section in both the nearby list and
  parking details states.
- Fix: removed that redundant inset while preserving the grip dimensions, its
  expanded touch area, the panel gap, and all content spacing below the first
  section.
- Post-fix evidence: the 780 × 664 comparison shows both states with a compact
  10.8-pixel visual gap from the grip bar to the first section boundary. The
  details body remains fitted at equal 355-pixel client and scroll heights with
  `overflow-y: clip`. Both focused mobile tests pass and the browser reports no
  console errors or warnings.
- The earlier P1 provider-authorization blocker remains unchanged: Street View
  imagery cannot be compared locally, although its frame and interaction work.

final result: blocked

## Compact directions toolbar QA

### Comparison setup

- Reference source: `/Users/tomauger/.codex/generated_images/019f8983-28c0-7e80-9421-97587b58aca7/exec-6a705299-548d-4522-8fe7-5fc46f6080ed.png`
- Normalized reference: `/Users/tomauger/projects/neuk-bike/playwright-videos/design-qa/directions-option-1-normalized.png`
- Implementation capture: `/Users/tomauger/projects/neuk-bike/playwright-videos/directions-compact-toolbar-handoff.png`
- Full comparison: `/Users/tomauger/projects/neuk-bike/playwright-videos/design-qa/directions-option-1-final-comparison.png`
- Focused header comparison: `/Users/tomauger/projects/neuk-bike/playwright-videos/design-qa/directions-option-1-header-final-comparison.png`
- Viewport: 390 x 844 CSS pixels
- Reference density: 853 x 1844 pixels, normalized to 390 x 844 for the comparison
- State: expanded mobile directions for Corstorphine High Street cycle parking

### Visible comparison evidence

- The large Exit directions button is replaced by a quiet left-aligned Back
  chevron, with the destination title and compact Start route action sharing
  one toolbar row.
- Capacity and cover are reduced to a one-line metadata strip beneath the title.
- The production sheet retains its existing 52dvh height, meeting the request
  for more route space without enlarging the view.
- The tighter header, route summary, and instruction spacing expose five full
  route steps at 390 x 844 while preserving 44-pixel Back and Start targets.
- The route instruction area remains independently scrollable and the document
  has no horizontal or vertical body overflow.

### Fidelity surfaces

- Typography: the app's existing family and weights are retained; the real
  destination remains a readable two-line heading.
- Spacing and layout: the toolbar uses a compact three-column grid, the metadata
  stays on one line, and the route list gains usable height without increasing
  the panel.
- Colors and tokens: existing surface, accent, border, and muted-text tokens are
  reused throughout.
- Image quality and assets: the live production map and existing Lucide route
  icons are retained; no generated visual assets were added to the product.
- Copy and content: Back, Start route, the parking facts, route summary, and all
  route steps reflect the live application state.

### Interaction and runtime checks

- Opening Directions shows the compact toolbar with Back on the left and Start
  route on the right.
- The route list scrolls independently; a manual gesture moved it through the
  later instructions while keeping the toolbar and summary fixed.
- Collapse and expand both retain the route state. The collapsed accessibility
  tree exposes only the intended summary and Back action.
- Back restores the results view with the same Corstorphine parking selection;
  reopening Directions returns to the verified handoff state.
- Start route is visible, enabled, and meets the 44-pixel touch-target minimum.
- The browser reported no console errors in the checked flow.
- The focused Playwright set passes the saved-neuk directions flow, compact
  mobile directions usability, and return-to-launching-view behavior.

### Findings and iteration history

1. P2: the first compact Start action was too wide and forced the real title to
   three lines. Its label spacing and padding were tightened.
2. P2: the title still wrapped earlier than the reference. The Start action was
   reduced to the reference footprint, restoring a two-line heading.
3. P2: the Back control and heading hierarchy remained oversized. Both were
   compacted while preserving 44-pixel hit areas and readable labels.
4. P2 accessibility: a pseudo-element metadata separator appeared as stray text
   in the collapsed accessibility snapshot. It was replaced with an explicitly
   hidden separator element.
5. P3 accepted: the live map crop differs slightly from the static design image,
   and the real heading breaks after `High` rather than after `Street`. Neither
   difference affects hierarchy, available route space, or interaction.

- P0: none.
- P1: none.
- P2: none after the final pass.

final result: passed

## Cycling-place opening-hours metadata QA

### Comparison setup

- Selected source visual:
  `/Users/tomauger/.codex/generated_images/019f8b44-965d-7220-8482-5d0715ddc952/exec-bd7ecfb3-55df-4652-8682-7eea0b9d1e0e.png`
- Normalized source:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/metadata-hours-reference-390.png`
- Implementation screenshot:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/metadata-hours-implementation-390-en.png`
- Side-by-side comparison:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/metadata-hours-comparison.png`
- Long-schedule check:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/metadata-hours-long-hire-390-en.png`
- Desktop check:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/metadata-hours-implementation-1280-en.png`
- Source pixels: 853 x 1844, normalized to 390 x 844.
- Implementation viewports: 390 x 844 mobile and 1280 x 800 desktop at
  device-pixel ratio 1.
- State: mock Edinburgh location, Shops selected, Wee Spoke Hub selected, and
  its existing Directions action visible.

### Fidelity surfaces

- Existing map, search controls, bottom sheet, localized heading, icon-bearing
  chips, result cards, numbering, and selected-card treatment remain unchanged.
- POI metadata now contains the distance in every row and adds a clock icon plus
  opening hours only when the OSM record provides them.
- The redundant `Bicycle shop`, repair, and hire category text is absent from
  result rows; the selected category chip continues to provide that context.
- Cycle Scotland and Bike Central demonstrate the intended distance-only state.
  Wee Spoke Hub and The Cycle Service demonstrate compact single-range hours.
- The selected Wee Spoke Hub row retains the existing full-width mobile
  Directions action. The desktop row retains its existing trailing Directions
  affordance and map-popup action.
- The live implementation intentionally retains the established production card
  height and spacing rather than adopting the generated mock's denser cards; this
  follows the user's explicit direction to keep the current list and Directions
  styling.

### Interaction and responsive evidence

- Shops, Repair, and Hire were each selected in the in-app browser. Every
  category showed distance-only rows when hours were missing and localized hours
  when present.
- A Hire result with a multi-clause weekly schedule wraps inside its row without
  document overflow; `24/7` remains unchanged.
- English, Gaelic, and Spanish were checked at 390 pixels. Weekday abbreviations
  render as `Wed–Sat`, `DiC–DiS`, and `mié–sáb` respectively.
- All three mobile locale checks measured equal 390-pixel document scroll and
  client widths. The Hire check also measured zero horizontal overflow.
- The OSM formatter improves common weekday and time-range typography but does
  not infer or display live `Open now` or `Closed` status.
- Unit coverage verifies English, Gaelic, Spanish, 24/7, unknown syntax, weekday
  lists, closures, and range formatting.

### Findings and resolution

- P1 resolved: relying on browser `Intl` data caused Gaelic weekday labels to
  fall back to English in the controlled browser. Stable locale-specific labels
  now make the UI independent of optional browser ICU coverage.
- P2 resolved: compact OSM weekday lists such as `Sa,Su` now render with a space
  after the comma for readability.
- P0: none. P1: none. P2: none after the final pass.

final result: passed

## Icon-preserving mobile category-chip QA

### Current-run evidence

- Previous icon-free Spanish row at 390 x 844:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/chips-icons-before-390-es.png`
- Icon-preserving Spanish row at 390 x 844:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/chips-icons-after-390-es.png`
- Spanish fallback scrolled fully to the final chip at 360 x 800:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/chips-icons-scroll-360-es.png`

### Findings and resolution

- The earlier icon-free mobile treatment is superseded by the user's preference
  to retain the category icons. The Lucide icons now stay inline at every
  viewport, using a compact 13-pixel mobile size and tighter chip spacing.
- Spanish uses concise filter actions, `Aparcar` and `Reparar`, while contextual
  place metadata keeps the noun `Reparación`. No non-filter copy was shortened.
- At 390 pixels, English, Gaelic, and Spanish each measure zero horizontal
  overflow, and all four icons remain visible.
- At 375 pixels, English, Gaelic, and Spanish again measure zero horizontal
  overflow. The row stays on one line with no clipping or text truncation.
- Below 370 pixels, the existing single-row horizontal snap fallback remains.
  At 360 pixels the Spanish row has 53 pixels of overflow; a horizontal scroll
  reaches the 53-pixel maximum and places the complete `Alquiler` chip inside
  the 326-pixel row viewport.
- Semantic buttons, the labelled filter group, `aria-pressed`, focus treatment,
  active color state, and desktop layout are unchanged.
- P0: none. P1: none. P2: none after the final pass.

final result: passed

## Bike neuk category chips prototype QA

### Comparison setup

- Source visual truth: `/Users/tomauger/.codex/generated_images/019f8b44-965d-7220-8482-5d0715ddc952/exec-254a70c6-3f1c-423a-aa7a-7d2f8876b1b5.png`
- Mobile implementation: `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/bike-neuks-shops-prototype-final.png`
- Desktop implementation: `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/bike-neuks-shops-desktop.png`
- Mobile viewport: 390 x 844 CSS pixels at device-pixel ratio 1
- Desktop viewport: 1280 x 800 CSS pixels
- Compared state: expanded nearby sheet, Shops selected, real Edinburgh OSM
  results, ranked list and ranked map pins

### Visible comparison evidence

- The implementation retains the reference's map-first composition, top search
  controls, bottom-sheet grip, umbrella `Nearby bike neuks` heading, one active
  category, ranked markers, and ranked results.
- The category control follows the later product decision to use compact chips
  rather than the reference's larger tile-like treatment. All four labels fit
  on one 390-pixel row with practical 38-pixel controls and additional spacing
  between the group and results.
- The live sheet uses the existing product's compact row density, radii,
  typography, green ranking scale, and selected teal token instead of importing
  an unrelated card system from the mock.
- Real OSM content replaces the mock names and distances. The first visible
  Edinburgh shop is Cycle Scotland at 421 m; the next rows remain legible with
  longer names such as Edinburgh Bicycle Co-operative.
- My neuks is intentionally absent outside Parking, matching the approved
  parking-only saving scope and reclaiming space for the filter row.

### Fidelity and accessibility surfaces

- Typography: the current app family, weights, scale, and hierarchy remain
  consistent. No label truncates or wraps in the checked mobile and desktop
  views.
- Layout and responsiveness: the chip row, results, and map do not overlap at
  390 x 844 or 1280 x 800. The desktop control pane preserves its existing
  width and scroll behavior.
- Colors and surfaces: the active teal, muted inactive chips, white sheet,
  subtle borders, and green ranks maintain the existing design tokens and the
  reference's category emphasis.
- Icons: all category controls use the existing Lucide icon family with matched
  size and stroke treatment. No custom SVG, CSS illustration, or placeholder
  visual was introduced.
- Accessibility: the filter is a labelled group of semantic buttons with
  `aria-pressed`; active state is not conveyed by color alone. Keyboard focus
  remains visible and non-parking selection exposes only the relevant
  Directions action.

### Interaction and runtime evidence

- Parking is selected on reload and My neuks remains available there.
- Shops, Repair, and Hire each load eight nearest real results in the Edinburgh
  test location and update ranked map pins together with the list.
- Repair selection exposes Directions without parking-only Details, Save,
  Share, Street View, or More controls.
- Returning to Parking restores My neuks and clears the non-parking selection.
- The Scotland release verifier passes for 614 unique POIs across 242 chunks,
  including content hashes, IDs, coordinates, category values, per-category
  counts, coverage, and report parity.
- The static export loads successfully at the mock-GPS URL and remains open for
  handoff.

### Findings and iteration history

1. P2: the first Shops pass updated the list and markers but retained the
   parking camera crop, leaving the nearest shop pins outside the visible map.
   The category load now issues the existing current-location focus request,
   fitting the user and ranked POIs into the visible map area.
2. P2: the initial marker category colors were declared before the base marker
   rules and could be overridden. The selectors now include the base marker
   class so shop, repair, and hire state colors are stable.
3. P2: generated compact JSON failed the repository-wide formatting check.
   Generated POI assets and their report now follow the same formatter-ignore
   policy as the existing generated parking release; the standalone verifier
   provides the appropriate integrity gate.
4. P0: none. P1: none. P2: none after the final pass.

final result: passed

## Directions metadata simplification QA

### Comparison setup

- Source visual truth: `/Users/tomauger/.codex/generated_images/019f8983-28c0-7e80-9421-97587b58aca7/exec-6a705299-548d-4522-8fe7-5fc46f6080ed.png`, with the user's later decision to replace the three-fact metadata treatment with capacity plus at most one useful exception.
- Normalized source: `/Users/tomauger/projects/neuk-bike/playwright-videos/design-qa/directions-option-1-normalized.png`
- Implementation screenshot: `/Users/tomauger/projects/neuk-bike/playwright-videos/directions-one-line-details-handoff.png`
- Full-view comparison: `/Users/tomauger/projects/neuk-bike/playwright-videos/design-qa/directions-one-line-details-comparison.png`
- Focused header comparison: `/Users/tomauger/projects/neuk-bike/playwright-videos/design-qa/directions-one-line-details-header-comparison.png`
- Source pixels: 853 x 1844, normalized to 390 x 844
- Implementation pixels and CSS viewport: 390 x 844 at device-pixel ratio 1
- State: expanded mobile directions for Corstorphine High Street cycle parking, with a loaded 605 m route

### Findings

- P0: none.
- P1: none.
- P2: none.
- The implementation intentionally omits the mock's `Not covered` value because
  the user's approved follow-up makes default negative and generic values
  subordinate to keeping the directions header on one line.
- The resulting live value is `6 spaces`; it measures one 14.21-pixel line,
  contains one detail item, and has equal 189-pixel client and scroll widths.
- The earlier accepted P3 remains: the real title wraps after `High` rather than
  after `Street`. The simplified metadata does not worsen that title wrapping.

### Fidelity surfaces

- Fonts and typography: existing family, weight, size, line height, and title
  hierarchy are unchanged; the metadata is now a stable single line.
- Spacing and layout rhythm: the 54.19-pixel header and existing 52dvh panel are
  unchanged, preserving the additional route-list space from the selected design.
- Colors and visual tokens: existing teal, surface, muted-text, and summary-strip
  tokens are unchanged.
- Image quality and assets: the live map, map markers, and Lucide controls remain
  unchanged; no replacement or generated assets were introduced.
- Copy and content: the directions header shows capacity first, adds Covered when
  applicable, otherwise permits one distinctive facility type, and suppresses
  generic Stands, Rack, Racks, and Not covered values.

### Interaction and runtime evidence

- Opened directions first for a covered facility with no listed capacity; the
  header correctly showed only `Covered`.
- Returned with Back, selected Corstorphine High Street, and reopened Directions;
  the loaded route correctly showed only `6 spaces`.
- The route list remains independently scrollable with a 303-pixel client height
  and 497-pixel scroll height.
- The document has no horizontal or vertical body overflow.
- The in-app browser reported no console errors.
- The focused mobile Playwright regression passes, and unit coverage verifies
  generic uncovered stands, covered stands, uncovered lockers, and the priority
  of Covered over a distinctive type.

### Comparison history

- The first focused browser assertion assumed the selected test fixture had a
  listed capacity. The rendered fixture correctly exposed only `Covered`; the
  assertion was changed to verify one detail item and the absence of generic
  `Stands` and `Not covered` copy. This was test-fixture drift, not a visual defect.
- Post-fix evidence: the 780 x 844 full comparison and 780 x 150 focused header
  comparison show the approved single-line treatment without changing the panel,
  toolbar, metrics, or visible route-step density.

final result: passed

## Current prototype status

The latest QA is the stacked multi-clause opening-hours section below. The
category-chip mobile and desktop comparisons, interaction checks, data
verification, and earlier opening-hours findings also remain current after this
presentation-only refinement.

final result: passed

## Mobile category-chip localization and reflow QA

Historical note: this no-icon iteration is retained as comparison evidence but
is superseded by the icon-preserving mobile category-chip QA above.

### Current-run evidence

- English overflow before the fix at 390 x 844:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/chips-before-mobile-390-en.png`
- Spanish overflow before the fix at 390 x 844:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/chips-before-mobile-390-es.png`
- Spanish fitted row after the fix at 390 x 844:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/chips-after-mobile-390-es.png`
- Spanish small-screen fallback before scrolling at 360 x 800:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/chips-after-mobile-360-es-scroll.png`
- Spanish small-screen fallback after scrolling to Hire:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/chips-after-mobile-360-es-scrolled.png`

### Findings and resolution

- P1 resolved: `flex: 1 0 auto` prevented every chip from shrinking. At 390
  pixels, the row overflowed by 9 pixels in English, 58 pixels in Gaelic, and
  113 pixels in Spanish, leaving Hire partly or wholly outside the pane.
- Mobile chips now use their full translated text without icons, distribute the
  available width according to label length, and remain on one row. At 390
  pixels the measured overflow is zero in English, Gaelic, and Spanish.
- At 375 pixels the full Spanish labels also fit with zero overflow.
- Below 370 pixels, the row deliberately changes to a horizontal snap scroller
  instead of compressing, truncating, or wrapping labels. At 360 pixels the
  measured 48-pixel overflow scrolls fully, placing the complete Hire chip
  inside the pane.
- The semantic labelled group, button roles, `aria-pressed` state, focus
  treatment, 38-pixel control height, translated copy, and desktop icon
  treatment are unchanged.
- P0: none. P1: none after the fix. P2: none.

final result: passed

## Compact category-chip vertical spacing QA

### Current-run evidence

- Previous spacing at 390 x 844:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/chips-vertical-spacing-before-390-es.png`
- Compact spacing at 390 x 844:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/chips-vertical-spacing-after-390-es.png`
- Final tightened spacing at 390 x 844:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/chips-final-tight-spacing-390-es.png`

### Findings and resolution

- The filter row's vertical margin changed from `0.65rem 0 0.75rem` to
  `0 0 0.25rem`, and its decorative vertical padding was removed.
- The first result moved from 564.12 to 542.53 CSS pixels, recovering 21.59
  pixels for the visible results without changing the sheet size.
- The final heading-to-filter gap is 12 pixels and the filter-to-result gap is
  16 pixels, preserving a readable grouping while removing surplus whitespace.
- Every chip remains 38 pixels high, every Lucide icon remains visible, and the
  Spanish row retains zero horizontal overflow at 390 pixels.
- The document has no horizontal or vertical body overflow, and the in-app
  browser reported no warnings or errors.
- Screenshot evidence confirms more of the fourth result is visible while the
  filter group remains visually distinct from both the heading and list.
- Accessibility note: the change only removes surrounding whitespace; semantic
  buttons, labels, focus treatment, and control height are unchanged. This is
  not a full keyboard or assistive-technology audit.
- P0: none. P1: none. P2: none after the final pass.

final result: passed

## Mobile localized heading reflow QA

### Current-run evidence

- Spanish stacked heading at 390 x 844:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/stacked-heading-390-es.png`
- Gaelic stacked heading at 390 x 844:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/stacked-heading-390-gd.png`

### Findings and resolution

- At 460 pixels and below, the localized nearest-result count now renders as a
  complete supporting line below the primary `Nearby bike neuks` heading.
- The inline separator is hidden in the stacked layout and marked
  `aria-hidden`, so the mobile heading's accessible name contains no stray dot.
- English `8 closest`, Gaelic `An 8 as fhaisge`, and Spanish
  `Los 8 más cercanos` each measure one 16.22-pixel line at 390 pixels.
- The document retains zero horizontal overflow in all three checked locales.
- At 1280 x 800, the count and separator remain inline and the heading stays on
  one 18.24-pixel line, preserving the established desktop treatment.
- The in-app browser reported no warnings or errors.
- Accessibility note: heading semantics and reading order are unchanged, but
  this is not a full screen-reader, keyboard, or zoom audit.
- P0: none. P1: none. P2: none after the final pass.

final result: passed

## Stacked multi-clause opening-hours QA

### Comparison setup

- Source visual truth (previous long-schedule treatment):
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/metadata-hours-long-hire-390-en.png`
- Implementation screenshot:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/opening-hours-stacked-long-hire-390-en.png`
- Full side-by-side comparison:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/opening-hours-stacked-comparison.png`
- Additional selected-shop evidence:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/opening-hours-stacked-390-en.png`
- Desktop evidence:
  `/Users/tomauger/.codex/visualizations/2026/07/22/019f8b44-965d-7220-8482-5d0715ddc952/opening-hours-stacked-1280-en.png`
- Source and mobile implementation pixels: 390 x 844 at a 390 x 844 CSS
  viewport and device-pixel ratio 1; no density normalization was needed.
- Desktop implementation pixels and viewport: 1280 x 800 at device-pixel ratio 1.
- Compared state: Edinburgh mock location, Hire selected, Soul Cycles selected,
  three opening-hours clauses, and the existing Directions action visible.
- A separate focused crop was not needed because the selected row and its small
  metadata are readable at 1:1 in the full 780 x 844 comparison.

### Fidelity surfaces

- Fonts and typography: the existing family, sizes, weights, line heights, and
  hierarchy are unchanged. Each semicolon-delimited schedule clause now occupies
  its own complete line without displaying punctuation between clauses.
- Spacing and layout rhythm: a multi-clause schedule begins below the distance.
  The distance pin and schedule clock share the exact same x-coordinate; schedule
  text aligns consistently after the single clock icon. Single-clause hours keep
  the compact horizontal treatment.
- Colors and tokens: existing muted metadata, teal selected state, white cards,
  borders, ranks, and Directions styling are unchanged.
- Image and icon fidelity: the live map and Lucide pin/clock/directions icons are
  preserved. No new image or approximate asset was introduced.
- Copy and content: all OSM clauses remain visible and localized; only the
  semicolon presentation changes. No hours are truncated and no open/closed state
  is inferred.

### Interaction and responsive evidence

- Soul Cycles renders three distinct lines and Leith Cycle Co renders four. Voi
  `24/7` and Pedal Forth's single schedule remain inline with the distance.
- At 390 pixels, the selected Soul Cycles metadata block is 68.38 pixels high;
  the document client and scroll widths both measure 390 pixels.
- The three checked stacked shop rows each place the pin and clock at the same
  77.20-pixel x-coordinate and render exactly two schedule lines.
- Spanish multi-clause schedules render as separate localized lines with zero
  document overflow. English formatter coverage also verifies one- and
  two-clause results explicitly.
- At 1280 pixels the same hierarchy is preserved in the side panel, including
  the established compact trailing Directions affordance for the selected row.
- The in-app browser reported no warnings or errors.

### Findings and comparison history

- P2 resolved: the previous semicolon-delimited text wrapped according to line
  length, separating clauses unpredictably and leaving the clock after a center
  dot on the distance line. Multi-clause schedules now use an intentional vertical
  block below distance, with aligned icons and one clause per line.
- P0: none. P1: none. P2: none after the final pass.

final result: passed
