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
