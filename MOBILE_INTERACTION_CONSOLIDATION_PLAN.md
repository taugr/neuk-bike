# Mobile interaction consolidation plan

## Status

Implemented in the current working tree on top of commit `60382f7`.

The consolidation keeps the existing interface while moving list selection,
details, directions, Nearby/My neuks, transition intent, and return origin into
one reducer-backed panel state. The existing content-height observer and map
focus coordinator remain the single sizing and camera paths; focused coverage
now protects the navigation, restoration, tall-screen sizing, and
reduced-motion contracts described below.

The plan remains in the repository as the source of truth for the interaction
contract and its regression scenarios.

## Implementation outcome

- Named reducer events now own panel navigation and reject invalid states such
  as details without a selected neuk.
- Directions returns to the list or details view that launched it.
- Nearby and My neuks retain independent selection and scroll context.
- List selection remains a preview, while pin selection opens details as a
  replacement transition.
- The existing `ResizeObserver`-based content sizing remains authoritative for
  details and saved content, including tall mobile viewports.
- The existing map focus coordinator remains authoritative for
  selection-driven movement and ignores background data updates.
- Documentation and focused unit and browser coverage now match the product
  behaviour.

## Product decision

Keep the current interaction direction rather than reverting to the previous
interface:

- The nearby list remains visible while someone compares neuks.
- Selecting a list row previews that neuk on the map and reveals `View details`
  and `Directions` in the selected row.
- Selecting a map pin opens the full mobile details view directly because the
  pin itself already communicates which neuk was chosen.
- The compact mobile popup remains visible for the selected pin and shows only
  capacity, parking type, and cover status.
- The full details view contains the complete available facts and the
  Directions, Street, Share, and Save actions.
- Back returns to the originating Nearby or My neuks list while preserving the
  selection and map context.
- Desktop retains its existing list, full popup, and inline actions. The
  dedicated details view remains a mobile pattern.

Do not add another inspection layer, modal, tab system, or popup variant. The
next work should simplify the implementation of these decisions rather than
add product states.

## Goals

1. Give every mobile action one predictable transition and destination.
2. Keep list comparison fast while retaining a clear route to details and
   directions.
3. Ensure the sheet always fits its content when space permits and scrolls only
   when the viewport genuinely requires it.
4. Coordinate sheet expansion and map movement as one visual response.
5. Preserve list position, selection, focus, and camera context when moving
   between Nearby, My neuks, details, and directions.
6. Reduce the number of independent booleans, effects, measurements, and
   animation branches needed to represent the flow.
7. Keep desktop behaviour visually and functionally unchanged.

## Non-goals

- Redesigning the nearby rows, compact popup, or details surface.
- Adding more facts or actions to the compact mobile popup.
- Removing the compact popup while details are visible.
- Changing nearby ranking, saved-neuk persistence, search, or routing.
- Introducing routes, modals, accounts, cloud sync, or a new navigation model.
- Deploying or changing production data as part of this work.

## Canonical state model

Treat the interface as a small number of primary panel views with orthogonal
context, rather than as every possible combination of flags.

### Primary panel view

| View         | Purpose                                       |
| ------------ | --------------------------------------------- |
| `list`       | Browse and compare either Nearby or My neuks  |
| `details`    | Inspect one selected neuk and use its actions |
| `directions` | View or follow a route to the selected neuk   |

### List context

The `list` view has one of two contexts:

- `nearby`
- `saved`

Each context retains its own selected neuk and scroll position. Returning from
details or directions restores the originating context rather than choosing a
new default.

### Presentation state

The following state is orthogonal to the primary view and should not create
additional product modes:

- selected neuk ID;
- sheet position: expanded or collapsed;
- transition intent: navigate or replace;
- map camera request in progress;
- temporary menu, confirmation, or focus-restoration target.

Where possible, derive booleans such as `isParkingDetailsMode` and
`isSavedListMode` from the canonical state instead of storing overlapping
truths independently.

## Interaction contract

| User action                      | Result                                                                             | Motion                                             |
| -------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| Tap an unselected list row       | Select it, show the compact popup, reveal row actions, and keep the list visible   | Local row expansion only                           |
| Tap a different list row         | Replace the selection and update the popup without changing panel view             | Local replacement; one camera move at most         |
| Tap `View details`               | Open details for the selected row and expand the sheet                             | Forward navigation transition                      |
| Tap a map pin                    | Select it and open details directly                                                | Content replacement, not a screen-navigation slide |
| Tap `Directions` in a row        | Open directions for that neuk                                                      | Forward navigation transition                      |
| Tap Back from details            | Return to the originating list with the same selection, scroll position, and popup | Reverse navigation transition                      |
| Exit directions                  | Return to the panel and context that launched directions                           | Reverse navigation transition                      |
| Tap `My neuks`                   | Replace Nearby with the saved list without moving the map                          | Directional list transition                        |
| Tap `Show nearby`                | Restore the previous Nearby list, selection, scroll position, and camera           | Reverse directional list transition                |
| Collapse or expand the sheet     | Change only its position                                                           | Sheet spring; no panel-view change                 |
| Save, share, or open Street View | Keep the details layout and scroll position stable                                 | Control feedback only                              |

All motion must respect `prefers-reduced-motion` and must not be required to
understand the resulting state.

## Implementation phases

### Phase 1: Align documentation and tests

- Update `design-qa.md` so it describes the current list-row preview behaviour.
- Keep one interaction matrix in this plan as the source of truth for mobile
  navigation decisions.
- Map the existing E2E tests to each row of the interaction contract and remove
  duplicate tests that assert the same behaviour indirectly.
- Add explicit coverage for returning to both Nearby and My neuks from details
  and directions.

### Phase 2: Consolidate panel state

- Replace overlapping panel/view transition flags with a reducer or equivalent
  transition function that owns the primary panel view, list context, origin,
  and selected ID.
- Give transitions named events such as `SELECT_LIST_POINT`,
  `OPEN_PIN_DETAILS`, `OPEN_DETAILS`, `OPEN_DIRECTIONS`, `GO_BACK`,
  `SHOW_SAVED`, and `SHOW_NEARBY`.
- Keep transient presentation data outside the product state when it does not
  affect navigation.
- Make invalid combinations unrepresentable, including details without a
  selected neuk and simultaneous details and directions.

### Phase 3: Centralise sheet measurement

- Keep one content-height measurement path for content-sized mobile views.
- Measure the rendered detail or saved-list content with `ResizeObserver`,
  including changes caused by long names, optional facts, saved state, font
  loading, and viewport resizing.
- Clamp the desired sheet height between a safe minimum and the available
  viewport height.
- Allow internal scrolling only when the measured content cannot fit within the
  available viewport.
- Reserve enough bottom inset that focused or pressed action borders are never
  clipped.
- Avoid updating the height when the measured result has not materially
  changed, preventing the list from sliding down and back up on load.

### Phase 4: Coordinate selection and camera movement

- Route all selection-driven camera changes through one coordinator.
- Calculate the final map padding from the destination sheet height before
  moving the camera.
- Issue at most one pan or fly operation for a single selection.
- When collapsed details expand for a newly selected pin, animate the sheet and
  camera toward their final positions as one response.
- Cancel or replace stale camera requests when another neuk is selected quickly.
- Do not move the camera when switching between Nearby and My neuks alone.

### Phase 5: Standardise restoration behaviour

- Preserve scroll positions separately for Nearby and My neuks.
- Restore scroll position without a visible initial correction or list bounce.
- Preserve the selected pin and compact popup when returning from details.
- Restore keyboard focus to the control that launched the destination while
  using `preventScroll`.
- Ensure Save, Share, and other detail actions do not change sheet scroll or
  height unless their visible content genuinely changes.

### Phase 6: Remove obsolete branches

- Delete CSS selectors, animation variants, refs, and effects that only support
  superseded interaction designs.
- Keep mobile-only detail behaviour behind the existing responsive boundary.
- Confirm that resizing from mobile details to desktop restores the desktop
  list and full popup without retaining mobile-only state.
- Avoid visual changes during this phase unless they correct a documented
  regression.

## Verification

### Automated checks

- `pnpm test`
- `pnpm lint`
- Focused mobile Playwright tests while iterating.
- `pnpm test:e2e` before considering the consolidation complete.
- `pnpm build` if component boundaries, static-export behaviour, or dynamic
  imports change.

### Required mobile scenarios

Verify at 390 x 844 and at least one taller phone viewport:

1. The nearby list loads without a down-and-up bounce.
2. Several list rows can be selected quickly while the list remains visible.
3. Each selection produces no more than one camera movement.
4. `View details` uses a navigation transition; a pin selection uses a
   replacement transition.
5. Short and long names produce a correctly sized detail sheet.
6. One-, two-, three-, and four-fact detail sets align correctly.
7. Save and Share leave the detail scroll position unchanged and do not clip
   action borders.
8. Collapsed details expand smoothly when another pin is selected.
9. Back restores the originating list, selected row, popup, and scroll position.
10. My neuks and Show nearby preserve their independent context and use the
    intended directional animation.
11. Reduced-motion mode remains fully understandable and functional.
12. Short viewports scroll only within the sheet and retain usable map space.

### Desktop regression scenarios

- Selecting a row keeps the list visible and opens the existing full popup.
- Desktop popup actions remain Directions, Street, Share, and Save.
- No mobile details sheet or mobile-only transition appears.
- Nearby/My neuks navigation and selected-row actions remain unchanged.
- Resizing from mobile details to desktop leaves the interface in a valid
  desktop list state.

## Completion criteria

The consolidation is complete when:

- the interaction contract is represented by one coherent state transition
  path;
- no supported action can create an invalid panel/view combination;
- sheet height follows rendered content without bounce, clipping, or avoidable
  scrolling;
- a selection causes no more than one coordinated camera movement;
- list, selection, focus, and camera context survive all documented returns;
- the required mobile and desktop scenarios pass in the browser;
- unit tests, lint, E2E tests, and any required build pass; and
- the resulting change does not add a new user-facing state or deploy anything.
