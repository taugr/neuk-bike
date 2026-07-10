# Design QA

- Source visual truth: generated product-design reference reviewed during implementation
- Implementation evidence: local mobile and desktop screenshots reviewed during QA
- Primary viewport: `390 x 844`
- Primary state: mock GPS at `55.9533,-3.1883`, results sheet expanded, nearest parking emphasized

## Findings

- No remaining P0, P1, or P2 visual mismatches.
- The implementation preserves the source direction: a single-row brand and search surface, map-first hierarchy, numbered green markers, an edge-to-edge draggable results sheet, an expanded nearest result, quiet share actions, and a clear primary directions action.
- The implementation intentionally uses a slightly taller sheet and a full-width directions action to improve touch comfort and scanning on a real phone viewport.
- P3 follow-up: records without a curated landmark name retain the source dataset's `Cycle parking <id>` fallback.

## Comparison history

1. Initial implementation review found two P1 issues in the selected state: both the nearest and selected rows expanded, and the selected map popup could settle underneath the mobile toolbar. It also found a P2 accessibility issue where the current-location marker exposed the generic name `Map marker`.
2. The list now expands the nearest row only when there is no explicit selection. A selected row becomes the single expanded result.
3. Visible-map calculations now account for the mobile toolbar, and selected popups pan into the unobstructed map area.
4. The current-location marker now exposes a specific accessible label and keyboard activation.
5. Post-fix mobile and desktop screenshots confirmed the selected marker, popup, and unobstructed map layout.

## Interaction and layout checks

- Results sheet expanded, collapsed, and transitioned its summary and list content correctly.
- Selecting Waterloo Place produced one expanded selected row and a fully visible popup.
- The Bike Neuks menu opened from the mobile toolbar with System, Light, Dark, and Attributions actions.
- The Attributions dialog opened and closed correctly from the branded menu.
- Mobile controls, marker target, directions action, and share action meet or exceed 44 px touch targets.
- Mobile document width matched the 390 px viewport with no horizontal overflow.
- Desktop remained map-first with the 460 px control pane.
- Browser console warnings and errors: none.

final result: passed
