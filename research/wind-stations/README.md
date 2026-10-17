# Retired station wind experiment

The station snapshot experiment was removed from the app on 17 October 2026.
These files retain the 15 October Edinburgh capture, provenance, interpolation
research and original route-scoring tests. They are not imported by the app or
copied into the static export. The normal wind layer uses regional forecasts.

`wind.ts` is the frozen scoring implementation used by the station tests, not
an alternative production implementation. Its shared forecast-grid helpers remain
imported from the main source tree; synthetic route geometry lives in
`test/fixtures/wind-routes.ts`.

Run the retained tests with `pnpm exec vitest run research/wind-stations`.
Reproduce the snapshot offline from the original raw capture directory with
`python3 research/wind-stations/prepare-snapshot.py RAW_DIR`.

The snapshot has three usable observations and one excluded stale airport
reading. Station positions, exposure and rights were not fully established;
this experiment did not demonstrate better forecast accuracy or street shelter.
The JSON retains original readings, source links and reuse notes.
