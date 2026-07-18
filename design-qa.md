# Design QA

## Reference and implementation

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

## States checked

- Nearby list with no selection.
- Nearby list with a selected pin and compact popup.
- Full parking detail sheet with the selected popup retained on the map.
- Back from full details to the same nearby list context.
- My Neuks list, full saved-neuk details, and Back to My Neuks.
- Desktop selected row, full popup, and inline actions at 1280 x 800.
- Mobile-details-to-desktop resize restores the desktop list automatically.
- Direct mobile pin selection opens the full detail sheet while retaining its compact map popup.
- One-, two-, three-, and four-fact detail strips, including public access when known.

## Comparison findings

- P0: none.
- P1: none.
- P2: none after the final spacing and detail-strip pass.
- The mobile implementation deliberately removes inline row actions from the browse list because the final product decision was to avoid a combined selected-and-nearby state.
- Desktop deliberately retains the previous inline row actions and full popup because the wider layout has enough space for both.
- The implementation deliberately retains the compact popup in the detail state because that was the final requested change after the detail mockup.
- Actual parking names and values replace the mock data while preserving the reference hierarchy, spacing, icon treatment, borders, and action layout.

## Functional checks

- On mobile, a marker selects the pin and opens the dedicated detail sheet immediately.
- The compact popup exposes capacity, type, and cover only.
- A list row also opens the dedicated detail sheet.
- The detail sheet contains Directions, Street, Share, and Save controls.
- Full details include access when known and distribute partial fact sets evenly.
- Circular action controls are visually distinct from the static fact strip.
- Compact popup facts are centred so wrapped cover labels remain balanced.
- The mobile detail sheet measures its content instead of reserving a fixed percentage of tall screens.
- Back restores the source list and keeps the selected pin and popup visible.
- On desktop, selecting a row retains the list, reveals Directions and More actions, and opens the previous full popup with Directions, Street, Share, and Save.
- No browser errors or warnings were recorded during the tested flow.

## Iteration history

1. Replaced the action-heavy popup with a compact three-fact preview.
2. Added the dedicated detail sheet and exact Back behavior.
3. Removed inline list actions to prevent a combined selected-and-nearby state.
4. Tightened the full-detail header and unified the three facts into one divided strip.
5. Removed programmatic pointer-focus styling and checked mobile and desktop containment.
6. Scoped the compact popup and dedicated detail sheet to mobile, restoring the previous desktop popup and selected-row actions.
7. Made mobile pin selection direct, removed the redundant popup chevron, added full access details, and tightened the sheet and action hierarchy.
8. Centred compact popup facts and made the detail sheet content-sized with a short-screen cap.

final result: passed
