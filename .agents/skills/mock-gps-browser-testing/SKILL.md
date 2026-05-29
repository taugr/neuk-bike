---
name: mock-gps-browser-testing
description: Use when testing Neuk Bike local browser geolocation, mocked GPS query parameters, live route tracking, directions mode, map marker behavior, or in-app Browser verification on localhost/static export.
---

# Mock GPS Browser Testing

Use this skill to verify Neuk Bike directions and live route behavior with the app's mock GPS query parameters. Prefer the Codex in-app Browser for local checks unless the user explicitly asks for Chrome.

## Production Export Setup

Run the static production build and serve `out/`:

```sh
pnpm build
cd out
python3 -m http.server 4173
```

Open URLs on `http://localhost:4173`. Mock GPS parameters are intended for localhost/loopback testing only.

## Canonical URLs

Use this base route for a non-trivial planned route to `Cycle parking 1`:

```text
http://localhost:4173/?lat=55.94155&lng=-3.29625&parking=1
```

Append one mock case at a time:

- Fixed current location: `&mockGps=55.94155,-3.29625,5`
- Moving mid-route: `&mockGpsPath=55.94155,-3.29625,5;55.9412,-3.2957,5&mockGpsStepMs=5000`
- Arrival: `&mockGpsPath=55.94155,-3.29625,5;55.9412,-3.2957,5;55.94085,-3.2951,5;55.9406042783081,-3.29451047885751,5&mockGpsStepMs=500`
- Off-route: `&mockGpsPath=55.94155,-3.29625,5;55.94155,-3.28625,5&mockGpsStepMs=5000`
- Too far from Edinburgh: `&mockGps=51.5072,-0.1276,5`
- Permission denied: `&mockGps=denied`
- Unavailable location: `&mockGps=unavailable`
- Invalid null-island location: `&mockGps=null-island`

Use the deterministic short-route URL when CycleStreets should not be involved:

```text
http://localhost:4173/?lat=55.9406042783081&lng=-3.29451047885751&parking=1
```

## Browser Workflow

1. Open the chosen URL in the in-app Browser.
2. Request directions to the selected parking point if directions are not already open.
3. Confirm `Start route` appears only after directions load and no `.live-route-marker` exists before starting.
4. Click `Start route`.
5. Check the relevant DOM and UI state for the mock case.

Prefer direct DOM inspection for state checks. Avoid screenshots unless the user asks for one.

## Expected Checks

- Live tracking starts with `Stop` and renders one `.live-route-marker`.
- The planned `.start-marker` and `.destination-marker` remain visible.
- On-route movement keeps the marker blue and avoids `.live-route-marker-off-route`.
- The heading cue appears only after browser heading or enough movement produces `headingDegrees`.
- The bike icon stays unrotated; only `.live-route-heading` rotates.
- The current-direction row is visible while tracking, before arrival, and the active instruction row remains identifiable in the list.
- Arrival shows `Arrived at bike parking.`, changes the live control to `Done`, and keeps directions open.
- `Done` or `Stop` removes the live marker while keeping the route and directions panel.
- `Exit directions`, route changes, geolocation errors, and unmount should clear the watch and remove live marker state.
- Off-route state keeps directions open and shows amber `.live-route-marker-off-route`.
- Permission denied shows `Enable location permissions to start route.` with no live marker.
- Too-far location shows `Start route is only available near Edinburgh.` with no live marker.
- Unavailable or invalid location shows `Live location is unavailable.` and does not remain in `Starting...`.
- Mobile collapsed directions panel hides live controls/current guidance while keeping `Exit directions` accessible.
- No live GPS coordinates, progress, heading, or accuracy values are sent to analytics.

## Non-Browser Checks

For route-progress or UI behavior changes, run the repo checks that match the change:

```sh
pnpm test
pnpm lint
pnpm format
pnpm build
```
