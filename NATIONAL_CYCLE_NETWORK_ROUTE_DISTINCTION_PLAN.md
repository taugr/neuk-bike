# National Cycle Network route distinction plan

## Status

Implemented locally and ready for manual verification. The hybrid selected-route
direction is now present on desktop and mobile; automated checks and the
repo-local design QA pass, while commit, push, and deployment remain pending.

The existing National Cycle Network integration should be committed as a
separate, validated baseline before this work begins. This plan, its mockups,
and any later implementation should remain a distinct change so the current
feature can be reviewed or reverted independently.

The design candidates and selected responsive mockups are stored as ignored
review artifacts:

- `output/route-distinction-mockups/01-combined-shields.png`;
- `output/route-distinction-mockups/02-selected-route-focus.png`;
- `output/route-distinction-mockups/03-separated-route-ribbons.png`.
- `output/route-distinction-mockups/04-hybrid-selected-route.png`, combining
  grouped co-route shields, selected-route focus, and neutral casing without
  permanent route-specific ribbons.
- `output/route-distinction-mockups/05-hybrid-selected-route-mobile.png`, the
  mobile companion with a compact route popup, sparse paired shields, and the
  collapsed results sheet kept in view.

## Goal

Help cyclists follow numbered National Cycle Network routes through junctions,
close parallel alignments, and shared stretches without losing the current
traffic-free, on-road, ferry, and unknown route-condition information.

The design must work on the constrained mobile map as well as desktop, remain
legible without relying on colour alone, and preserve the map-first character
of Bike Neuks.

## Current behaviour and evidence

The map currently uses line styling to communicate riding context:

- traffic-free: solid green;
- on-road: dashed purple;
- ferry: dotted cyan;
- unknown: dashed grey;
- temporary closure: orange overlay;
- route identity: repeated red NCN, blue RCN, or grey link shields.

This hierarchy is useful and should remain. It makes the likely riding
environment distinguishable even when a user cannot read a shield.

It is not sufficient for route identity:

- 987 rounded-coordinate locations in the generated dataset contain more than
  one distinct route number;
- around 80% of those locations contain routes with the same route-condition
  classification, so the current line colours cannot distinguish them;
- at the Carlisle example, routes 6 and 10 share the same dashed alignment and
  are communicated only by alternating shields;
- at the Preston mobile example, collision avoidance suppresses some of the
  shields around routes 6, 62, 622, and 55;
- assigning a permanent colour to every route would still fail where two
  coincident lines cover one another, would create a large palette to learn,
  and would weaken accessibility.

The audit captures are stored in the ignored
`output/route-color-audit/` directory.

## Design principles

1. **Keep condition semantics stable.** Line colour and dash pattern continue
   to communicate traffic-free, on-road, ferry, unknown, and closure states.
2. **Use route numbers for identity.** Shields, combined route labels, and
   selection state identify numbered routes.
3. **Do not rely on colour alone.** Selection must also change width, casing,
   opacity, or label treatment.
4. **Represent shared routes honestly.** A shared physical segment must not
   appear to belong to only whichever feature happened to render last.
5. **Prioritise mobile.** Dense route junctions need a legible compact treatment
   rather than simply showing more individual shields.
6. **Keep the default map calm.** Strong route-specific emphasis should be
   temporary and user-triggered rather than a permanent rainbow overlay.

## Mockup directions

Three visual directions should be compared before implementation.

### Direction A: combined shields

- Keep the current line styling unchanged.
- Replace alternating shields on a shared stretch with a compact adjacent or
  stacked group, such as route 6 and route 10 shields shown together.
- Give combined shields a subtle contrasting halo so they remain readable over
  streets, water, and green areas.
- Collapse link and main-route records with the same route number into one
  understandable route identity where the source data supports it.

This is the smallest visual change and improves the default state, but it does
not by itself help a user trace one route through a complex junction.

### Direction B: selected-route focus

- Keep the current default line and shield treatment.
- Clicking a route selects its route identity rather than only one segment.
- Draw the selected route with a wider contrasting casing and stronger opacity
  while gently fading other network routes.
- Keep condition colour and dash pattern visible inside the selected casing.
- Show the selected route shield in the popup and allow selection to be
  cleared without closing unrelated parking state.

This gives the strongest route-following behaviour and avoids a permanent
route-colour palette, but shared segments still need a clear multi-route label.

### Direction C: separated route ribbons

- Retain condition styling as the primary line.
- Add subtle offset route-identity ribbons or edge marks where numbered routes
  run closely together.
- Use shields at junctions to connect each ribbon back to its route number.
- Collapse the treatment at lower zooms and on mobile to prevent clutter.

This can make close parallel routes easier to distinguish, but it is the most
complex direction and risks implying that coincident routes are physically
separate.

## Recommended direction

Use a restrained combination of Directions A and B:

- combined shields in the default state;
- selected-route focus when the user taps a route;
- a subtle neutral casing for close-line readability;
- no permanent unique colour for every route.

Direction C should remain an experiment unless testing demonstrates a common
case where combined shields and selection cannot make adjacent routes clear.

## Data and presentation model

### Route identity

Add a tested presentation helper that derives a stable route identity from a
feature:

- NCN and RCN: route type plus `routeNumber`;
- links: associate `linkNumber` with the corresponding numbered route when
  supported by the source values, while retaining the link route type for
  disclosure;
- unknown or unnumbered records: no selectable route identity.

Keep this separate from the feature ID. A feature is a source segment; a route
identity can span many segments.

### Shared-route bundles

MapLibre cannot communicate coincident features reliably by rendering one
symbol per source feature. Derive a small presentation collection for the
current viewport containing:

- an anchor coordinate;
- the distinct visible route identities at that anchor;
- the contributing feature IDs;
- the route-condition values represented;
- a stable bundle key.

Start by deriving this client-side from already-loaded cycle-network features;
do not add another runtime dataset request. If profiling shows that viewport
grouping is too expensive, move only the label-anchor derivation into the
existing static generation pipeline.

Avoid grouping routes merely because their bounds overlap. Bundle only when
their coordinates are coincident within a documented small tolerance and the
result is stable across adjacent chunks.

### Selection state

Store the selected route identity in the map component or finder state. Render
selection using a dedicated highlight layer filtered by the derived route
identity, rather than mutating the base condition layers.

The highlight should use:

- a contrasting light/dark casing;
- increased line width and opacity;
- the existing condition colour and dash pattern above the casing;
- reduced, but still visible, opacity for unselected network routes;
- combined shields that continue to disclose co-routes on shared sections.

Selection is transient map state and does not need URL or local-storage
persistence in the first iteration.

## Interaction behaviour

1. A route click closes any parking popup, following the existing one-popup
   rule.
2. If the clicked location contains one route identity, select it immediately
   and open its popup.
3. If it contains multiple route identities, show their shields together in
   the popup and make the selected identity explicit without requiring a large
   modal or sheet.
4. Clicking another route changes selection and reuses the same popup
   lifecycle.
5. Clicking a parking pin clears route selection and closes the route popup.
6. Closing the route popup clears route selection unless user testing shows a
   strong need for a persistent trace mode.
7. Locale or theme changes must close or fully rerender the route popup and
   update highlight styling immediately.
8. Disabling the National Cycle Network layer clears selection and must not
   download cycle-network chunks.

## Responsive behaviour

### Desktop

- Use combined shields at a moderate interval on shared stretches.
- Allow enough repeated shields to follow a route without obscuring the map.
- Keep route-selection emphasis visible below parking markers and above base
  map roads.

### Mobile

- Prefer one compact combined shield group over several colliding labels.
- Keep the selected route shield visible even when ordinary shield collision
  rules would hide it.
- Reduce unselected label density before reducing selected-route clarity.
- Verify the map treatment with the results sheet expanded, collapsed, and
  while a compact route popup is open.

## Accessibility

- Preserve solid, dashed, and dotted line patterns as non-colour cues.
- Give selected routes both a width/casing change and an opacity change.
- Maintain readable shield text and a high-contrast border in light and dark
  themes.
- Do not communicate shared routes using two colours without also showing both
  route numbers.
- Keep route selection operable through the existing accessible popup and map
  controls; do not claim full keyboard or screen-reader support from visual
  testing alone.
- Respect reduced-motion preferences if selection introduces any animated
  transition.

## Implementation stages

### Stage 0: preserve the current baseline

- Review the current diff one final time.
- Commit the existing National Cycle Network integration and its current tests
  as one conventional commit.
- Do not include route-distinction implementation in that commit.
- Push or deploy only when explicitly requested; a local commit is not a
  deployment.

### Stage 1: route-identity helpers

- Add a route-identity type and derivation helpers near the existing
  cycle-network presentation logic.
- Add focused unit tests for NCN, RCN, link, missing-number, and malformed
  combinations.
- Add viewport bundle helpers and tests for coincident, close-but-separate,
  duplicate-chunk, and mixed-condition routes.

### Stage 2: visual foundation

- Add a neutral casing below the existing condition layers.
- Preserve current line colours, dash arrays, closure overlay, hit target, and
  direction-mode opacity.
- Verify ordering against base-map labels, route shields, parking markers, and
  the active directions route.

### Stage 3: combined route shields

- Replace feature-level repeated labels with bundle-aware label data where
  routes share a stretch.
- Reuse the existing NCN, RCN, and link shield language.
- Add a selected-shield variant only if required by the chosen mockup.
- Tune density separately for desktop and mobile.

### Stage 4: selected-route focus

- Add transient route selection state.
- Add casing and highlight layers filtered by selected route identity.
- Update the route popup to disclose co-routes and selected identity compactly.
- Preserve the one-popup rule with parking markers.

### Stage 5: verification and refinement

- Run focused unit tests, cycle-network browser tests, full tests, lint,
  formatting, network-data verification, and a production build.
- Verify the known Preston, Carlisle, and Bristol examples in light and dark
  themes.
- Verify desktop and mobile with the results panel expanded and collapsed.
- Check browser console and network requests as well as visual output.
- Refresh the static preview on port 4181 and leave it running for manual
  review before any deployment.

## Test cases

### Unit tests

- stable route identity for every supported route type;
- same-number link and main-route association;
- multiple distinct routes at one anchor form one ordered bundle;
- duplicate features from adjacent chunks do not duplicate shields;
- close parallel routes outside the tolerance remain separate;
- selection filter matches every visible segment of one route identity;
- condition type remains independent of route identity.

### Browser tests

- Carlisle: routes 6 and 10 are both disclosed on their shared alignment;
- Preston desktop: routes 6, 62, 622, and 55 remain understandable at the
  junction;
- Preston mobile: a compact combined treatment survives label collision;
- Bristol: traffic-free and on-road semantics remain unchanged;
- clicking a route highlights it immediately and opens one popup;
- clicking a parking pin clears route selection and closes the route popup;
- disabling the layer clears selection and makes no chunk requests;
- locale and theme changes do not leave stale popup or highlight styling.

### Visual checks

- light and dark map themes;
- 1280 x 800 desktop;
- 390 x 844 mobile;
- ordinary, shared, close-parallel, ferry, and closure examples;
- selected and unselected states;
- directions mode, ensuring the navigated route remains dominant.

## Acceptance criteria

- Users can identify every numbered route represented on a tested shared
  stretch without tapping several overlapping segments.
- Users can select one numbered route and trace its visible segments through a
  junction.
- Traffic-free, on-road, ferry, unknown, and closure meanings remain stable.
- The treatment remains understandable without route-specific colour alone.
- Mobile label collision does not silently hide the fact that multiple routes
  share the selected location.
- Parking markers, directions, popups, and the one-popup rule remain intact.
- No additional cycle-network runtime request is introduced in the initial
  implementation.
- Focused and full validation pass, and the refreshed static preview is left
  running for manual verification.

## Commit, push, and deployment boundaries

Use separate checkpoints:

1. Commit the current validated National Cycle Network implementation.
2. Keep this design plan and selected mockup as the reviewable starting point
   for route-distinction work.
3. Commit the route-distinction implementation only after its focused and full
   validation passes.
4. Push only when requested.
5. Treat a successful push as distinct from a successful Cloudflare Pages
   deployment.
6. Deploy only when explicitly requested, then verify the exact deployed SHA
   and both `neuk.bike` and `neuk-bike.pages.dev`.
