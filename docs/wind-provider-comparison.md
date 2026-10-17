# Edinburgh provider wind comparison — 15 October 2026

The private preview now uses a bounded spatial sample of UK Met Office UKV
forecasts through Open-Meteo. The captured comparison supports regional variation;
it does **not** establish improved forecast accuracy or street-level detail.
The dated station experiment has been retired to
[`research/wind-stations/`](../research/wind-stations/README.md). Station readings
do not adjust this forecast.

This document records the original experiment. The current app exposes wind only
as a manual map layer; automatic headwind route selection is hidden pending
validation. See the [current workflow](../README.md#wind-forecast).

## Evidence

The same capture session queried the previous city `ukmo_seamless` baseline,
20 regional points with explicit `ukmo_uk_deterministic_2km`, and three nearly
identical city control points. All comparisons select the same UTC valid hour.
The controls return the same grid coordinates and identical hourly values as the
baseline; they do not create new information. The regional points resolve to
20 distinct returned cells. Values and timestamps are preserved in
[`ukv-edinburgh-2026-10-15.json`](../src/lib/fixtures/ukv-edinburgh-2026-10-15.json),
including original request URLs, capture times and raw-response SHA256 digests.

| UTC valid hour | City baseline (m/s, from °) | Regional speed range (m/s) | Regional direction range (from °) |
| -------------- | --------------------------- | -------------------------- | --------------------------------- |
| 15 Oct 19:00   | 3.4, 230°                   | 3.1–7.4                    | 200–236°                          |
| 15 Oct 20:00   | 2.6, 222°                   | 1.9–6.2                    | 178–286°                          |
| 15 Oct 21:00   | 2.4, 260°                   | 1.6–6.1                    | 218–306°                          |
| 15 Oct 22:00   | 3.4, 242°                   | 2.3–4.8                    | 194–262°                          |

Run `python3 scripts/compare-provider-wind.py` to reproduce exact coordinates,
edge spacing, signed air components and hour comparisons without network access.
The source fixture is historical test evidence and is **never served as a current
forecast** by the app. Raw captures remain in ignored local preview evidence.

## Provider contract

[Open-Meteo's UKMO documentation](https://open-meteo.com/en/docs/ukmo-api)
describes UKV as a 2 km hourly model with a two-day forecast, updated hourly,
and an additional four-hour open-data delay. The API does not return the model
run timestamp with these forecasts, so the UI distinguishes forecast validity
from fetch time and does not claim a newly fetched response is a new model run.
UKMO data and derived forecasts retain CC BY-SA 4.0 attribution.

[The general API documentation](https://open-meteo.com/en/docs) identifies returned
coordinates as the selected weather-cell centres. Requests use `cell_selection=nearest`
and `elevation=nan` per point to avoid terrain-based cell selection/downscaling.
The fixed 4×5 geographic sample uses no rider coordinates. Requests are about
4–6 km apart in the returned mesh, coarser than the native model. Interpolated
values between them are application estimates, not extra provider cells; the
city interpolation need not reproduce the independently queried city cell.

[Free-service terms](https://open-meteo.com/en/terms) permit this private
non-commercial preview without a key/account: fewer than 600 calls/minute,
5,000/hour and 10,000/day. No paid endpoint is used. The app makes one bounded
20-location request per refresh, not one request per arrow, pan or route.
API accounting may count multi-location requests separately; this is not a
production traffic or commercial-use approval.

## Implementation and failure behavior

- Preserve each returned coordinate, source URL, explicit model, resolution,
  validity and fetch time. Require all 20 distinct cells, valid m/s and directions,
  matching UTC hours, plausible positions and an ordered, non-folded mesh.
- Bilinearly interpolate signed east/north airflow over the returned quadrilaterals.
  Shared edges are continuous. Do not interpolate bearing angles directly or
  extrapolate beyond the mesh. Opposing vectors are marked variable rather than calm.
- Map arrows and candidate route scores share the same sampler. Routes test their
  vertices and sample segments at most 100 m apart, preserving cycling-profile,
  endpoint, corridor/backtracking and +20% time / +25% distance bounds.
- Refresh every 30 minutes while wind is needed, with one optional per-tab session
  cache. Re-enabling the layer reuses a recent cache without relabelling its fetch
  time. The forecast hour advances with UTC time, including after sleep.
- If the grid fails, request the previous single-city forecast and explicitly show
  “Area forecast (grid unavailable)”. If both requests fail, a cached grid remains
  usable for at most two hours with its original fetch time and a cached label.
  Missing/expired data cannot change a route. Forecast changes clear a comparison
  and restore its baseline outside an active ride; riding geometry is not changed.
- The original hostname restriction has been replaced by the build-time
  `NEXT_PUBLIC_WIND_ENABLED` flag; see the current [wind workflow](../README.md#wind-forecast).
  The retired station snapshot is research evidence and is not served by the app.

## Verification

Actual captured-response tests cover distinct/duplicate cells, temporal alignment,
unit/position validation, original sample recovery, vector wrap/cancellation,
shared-edge continuity, domain boundaries, stale data and shared route sampling.
Browser checks cover preserved samples, caches, fallbacks,
route preference, manual layer overrides and mobile layout. Actual private-URL
motion recordings and screenshot receipts are in `/evidence/provider-grid/` on
port 4194. No push, merge, deployment, dependency or access-setting changes.
