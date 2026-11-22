# Bike Neuk

<p align="center">
  <img src="./public/icon-192.png" alt="Bike Neuk icon" width="140" />
  <br />
  <a href="https://neuk.bike/">
    <img src="https://img.shields.io/badge/live-Cloudflare%20Pages-0f766e" alt="live app" />
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="license" />
  </a>
  <br />
  Static, mobile-friendly map for finding nearby cycle parking across the UK, Ireland, Spain and Armenia.
</p>

## Features

- Find nearby cycle parking from your current location in the UK, Ireland,
  Spain, or Armenia
- Search from a UK, Irish, Spanish, or Armenian street, postcode, town, or place
- Browse a map-first interface without an app account or backend
- See the official UK National Cycle Network as a default-on, optional map
  layer from zoom 10
- Show nearby OpenStreetMap drinking-water points as a default-off map layer
- Regional wind forecasts as an optional map layer
- Show cycle directions to a selected parking place with CycleStreets
- Build multi-stop cycle routes and compare Quietest, Balanced, and Fastest
  options with distance and total climbing where elevation data is available
- Compare the best three neuks near a route destination, then finish the route
  at the chosen parking place
- Save routes on the current device and export them as GPX files
- See capacity, access, cover, and stand type when mapped
- Share parking places with source-qualified `?parking=` links
- Install the app as a Progressive Web App
- Download an explicit map area for predictable offline parking, cycling-place,
  and National Cycle Network access
- Use the interface in English, Scottish Gaelic, Spanish, or Armenian

## Map controls

Map layers includes an optional Satellite switch using Esri World Imagery,
with place labels, parking and route overlays retained in both 2D and 3D.
The choice is remembered on this device. On reopening, the loading background
stays visible until the saved satellite and 3D view is ready, without first
showing the ordinary flat map. Imagery loads only when selected; switching it
on while browsing keeps the street map visible until it is ready. A failed connection or going
offline returns to the street map. Satellite imagery is not included in offline
area downloads. Detailed imagery falls back to coarser tiles where unavailable.
Imagery credits use the same startup fade as the street map and remain available
in the Attributions panel: © Esri, Vantor,
Earthstar Geographics, and the GIS User Community ([World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9)).

On mobile, tap the tray's handle or drag its handle and title area to expand or
collapse it. The compact handle and title form a broad drag area;
titles in parking, directions and route trays accept drags. Header buttons and
route-name inputs keep their usual actions, and the content below scrolls
independently.

Use the compass below Map layers to see north: drag it to rotate the map,
then tap it to face north again. Two-finger rotation on touch screens and
right-button dragging on desktop also rotate the map. The 3D/2D button below
the compass switches between a flat map and terrain at a 55° tilt, keeping
the current location, zoom and bearing. The choice is remembered on this device;
new visitors start in 2D. The compass faces north without changing the mode.
In 3D, drag up or down with the right mouse button (or Control-drag) to tilt;
on touch screens, slide two fingers up or down together. Normal dragging pans
in any direction. Tilt is adjustable from 0° to 60°; 2D stays flat.
In 3D, surrounding pins are spaced according to their on-screen positions,
with more room between distant pins. Pan, zoom in or flatten the view to reveal
more. Selected, saved and numbered neuks stay visible, and small camera movements
retain existing pins where possible. This only changes the map display; the
nearby list and parking data are unchanged.
Parking pins in 3D have a softly bevelled, upright face, a short stem and a
ground shadow. Their numbers remain facing the screen as the map rotates or
tilts. Close-up model buttons retain their compact appearance.
Live routes follow the terrain while GPS progress, off-route detection and
arrival work as in 2D. The heading cue follows map rotation and tilt, and the
camera pans to keep the rider in the uncovered map area. It retains the chosen
view rather than automatically turning or flying along the route.
Switching to 3D prepares elevation before smoothly tilting; reopening a saved
3D view starts at its tilted angle. The map flattens before
removing terrain on the way back. Reduced-motion preferences skip the animation.
3D uses [Mapzen terrain tiles](https://registry.opendata.aws/terrain-tiles/)
with [source credits and licences](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
At zoom 17 and closer, both street and satellite 3D views show enlarged, ground-anchored illustrations
for recognized parking types. The catalogue includes stands, post hoops, wheel
loops, supported loops, wheel racks, two-tier and upright racks, wave racks,
anchors, ground slots, handlebar holders, saddle rails, railings, A-frames,
scissor racks, lockers, streetpods, sheds, shelters, bollards, floor bays,
trees, slotted logs, planters, bench hoops, lamp posts, and bicycle docks.
Models show details such as bolted feet, galvanized tubing, ventilated doors,
painted frames and curved translucent shelter roofs. The app generates and
reuses the meshes in the browser. At zoom 19 and closer, the app adds soft
shadows under the fixtures' supports and loads one small shared surface
texture. Shading continues while the texture loads or is unavailable offline.
Dimensions, orientation and fixture counts are illustrative.
Satellite imagery adds brighter metal, frames and solid materials, a thin dark
outline and slightly fuller tubing at the first model zoom levels. Canopy glass
has a clearer pale-blue tint and stronger reflections while remaining translucent.
Switching imagery off restores the standard appearance of every model.
Case, spacing, hyphens and known aliases are normalized;
unknown, access-only, capacity-only and mixed fixture types keep their pins.
Building extrusions flatten at this close zoom so roofs do not hide the parking
symbols. Zoom out or switch to 2D to return to pin symbols. Selection, ranking,
saved badges, and keyboard access remain available. Nearby neuks have individual
models, separated where possible by small display-only offsets of up to 8 metres.
A ground dot and dotted connector show the real location of a displaced model.
Placement settles after camera gestures and reserves room for roofs and selection
outlines. Dense collisions retain a counted group with individual selection buttons;
mixed types use a neutral count rather than a misleading shared illustration.
Zooming closer retries separation. Directions, sharing and saved locations always
use the original coordinates.
During route planning and guidance, close zoom shows only the destination's
parking model in the selected teal style, with its destination marker retained.
The marker sits above the model with a short connecting line. Selecting the
arrival instruction highlights this marker instead of adding a second pin.
Ordinary place destinations and the route overview keep their simple markers.

For the [Waverley aerial preview](http://127.0.0.1:4181/?lat=55.9533&lng=-3.1883&aerialPreview=1),
serve the static export locally. It opens in 3D Satellite with surveyed terrain and
roof profiles over roughly 560 × 445 metres. OpenFreeMap supplies the footprints.
The roofs use a filtered colour sample from inside each footprint, with shaded
surfaces and defined edges. Roof materials are modelled with smoothed lighting
across the surveyed geometry. Waverley Station has metal framing and glazed panes,
and the other roof finishes are illustrative. From zoom 18, the preview reuses
aerial tiles to add fine surface detail within visible footprints. It uses a
finer imagery level from zoom 19 and falls back to the coarser tiles when needed.
The shader softens roof outlines and suppresses broad or over-zoomed photo detail.
The LiDAR assets load in Satellite and 3D together.

The [shaded buildings preview](http://127.0.0.1:4181/?lat=55.95336&lng=-3.19059&aerialPreview=1&buildings=shaded)
uses the surveyed roof profiles and building footprints with plain walls and
directional shading. The satellite imagery stays on the ground. Zoom in around
Princes Street to compare it with the photographed façade and roof previews.
At close zoom, the shaded preview loads a half-metre elevation grid for
10–25 Princes Street so the mesh can retain smaller surveyed roof features.
Six frontage spans have repeated laser returns at consistent heights. Narrow
3D bands mark those spans, with approximate depth. The survey does not resolve
individual windows or doors reliably. The bands were checked against the
Phase 5 LAS tiles NT2573 and NT2574, using the median elevation and central
90% of the along-street range of each selected group of façade returns.

The [modelled façade preview](http://127.0.0.1:4181/?lat=55.9533&lng=-3.1883&aerialPreview=1&buildings=shaded&facades=model)
adds recessed windows, projecting bays, shopfronts and street entrances from
zoom 18 on the Princes Street side of the block. Storefront colours, window
arrangements and trim were traced from the [street photo references](public/textures/princes-street-facades.license.txt).
The building surfaces use geometry and shaded materials. The window and
door depths are approximate. Where the LiDAR grid rounds off a street-facing
eave, the local preview fits the cornice using the trace and nearby roof
elevations. Façades outside the reference coverage use the plain shaded finish.
The roof shader adds slate courses on the smaller roofs, sheet seams on the
lighter east deck, and shadows around the two surveyed lightwells. The deck
levels out between the lightwells, and fine seams fade across steep or uneven
survey surfaces. The finishes
are inferred from [aerial reference frames](public/textures/princes-street-roof-detail.license.txt).
The shader generates the patterns over the LiDAR mesh without loading roof
photographs.

Waverley Gate uses a rectified photograph on its Waterloo Place and North
Bridge façades, aligned to the surveyed building height.
The [Princes Street façade preview](http://127.0.0.1:4181/?lat=55.9533&lng=-3.1883&aerialPreview=1&facades=princes)
shows the photographed south-facing row at 10–25 Princes Street. One WebP
texture loads from zoom 18 when that frontage is in view. Shaded walls fill
areas the photos could not capture clearly. The
[source notes](public/textures/princes-street-facades.license.txt) list the
four photographs and their licences. To regenerate the texture with
ImageMagick, run `python3 scripts/build-princes-street-facades.py <photo-directory>`
with the JPEG filenames listed in the notes.
The [Princes Street roof photo preview](http://127.0.0.1:4181/?lat=55.9533&lng=-3.1883&aerialPreview=1&facades=princes&roofs=photo)
uses a CC BY-SA drone photograph from April 2025 on the visible roof
surfaces of that block. A mask leaves hidden and uncertain areas shaded.
The texture loads from zoom 18 when the block is in view. Remove
`&roofs=photo` to compare the same camera with the shaded roofs.
To rebuild, use `python3 scripts/build-princes-street-roof-photo.py <original-jpeg>`
with the Python dependencies for the LiDAR script. The
[roof photo credits](public/textures/princes-street-roofs.license.txt)
link the original image and survey.
The [roof detail preview](http://127.0.0.1:4181/?lat=55.9533&lng=-3.1883&aerialPreview=1&facades=princes&roofs=detail)
uses two registered 4K drone frames across 10–25 Princes Street. The frames
show the main deck and parts of the smaller roofs and slopes beside it.
The smaller roofs use photographed details over the shaded LiDAR finish,
which also fills gaps in coverage. Use `roofs=photo`
to compare with the original drone photo. The
[detail texture credits](public/textures/princes-street-roof-detail.license.txt)
include the source and rebuild steps.
Street-facing shopfronts use mapped businesses and local street geometry.
Display windows and doorways are modelled at the surveyed pavement height.
Parking models in the 3D Satellite previews use fixed metre dimensions at their
mapped locations. The perspective view shrinks them with distance, and they
fade as they become too small to resolve. Their badges retain their touch target.

The [preview without local LiDAR](http://127.0.0.1:4181/?lat=55.9533&lng=-3.1883&aerialPreview=1&lidar=0)
is available for comparison.

To regenerate the local tiles and surface grid, run
`python3 scripts/build-waverley-lidar.py` in a Python environment with
`rasterio`, `numpy`, and `Pillow`. The script reads cropped sections of the
Scottish Phase 5 NT27SE 50 cm terrain and surface rasters and uses Mapzen
elevation along the terrain boundary. The surface grid stores paired surface
and ground elevations in decimetres. Crown copyright Scottish Government and
Fugro (2020). [Scottish Public Sector LiDAR and licence](https://registry.opendata.aws/scottish-lidar/)
· [Mapzen elevation attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
Add `--princes-roofs-only` to rebuild only the detailed Princes Street roof grid.

### Edinburgh 3D buildings

Switch on Satellite in Map layers and use the 3D button to see buildings.
Edinburgh uses detailed meshes with LiDAR terrain. Elsewhere the same view
shows OpenFreeMap buildings where height data is available. Select a neuk
behind a building to turn to a clear angle when the map can find one.

Open the local citywide 3D Satellite view at
[Grassmarket](http://127.0.0.1:4181/?lat=55.94735&lng=-3.197&aerialPreview=1&buildings=edinburgh),
[Stockbridge](http://127.0.0.1:4181/?lat=55.95875&lng=-3.2097&aerialPreview=1&buildings=edinburgh),
[Old Town](http://127.0.0.1:4181/?lat=55.94991&lng=-3.18896&aerialPreview=1&buildings=edinburgh),
[New Town](http://127.0.0.1:4181/?lat=55.95151&lng=-3.20736&aerialPreview=1&buildings=edinburgh),
[the Shore in Leith](http://127.0.0.1:4181/?lat=55.9763&lng=-3.1693&aerialPreview=1&buildings=edinburgh),
[Portobello](http://127.0.0.1:4181/?lat=55.9532&lng=-3.1134&aerialPreview=1&buildings=edinburgh),
or [South Queensferry](http://127.0.0.1:4181/?lat=55.9905&lng=-3.3975&aerialPreview=1&buildings=edinburgh).
The [city overview](http://127.0.0.1:4181/?lat=55.9489&lng=-3.2104&aerialPreview=1&buildings=edinburgh&landmark=edinburgh-city)
starts with a wider view. It streams up to nine detailed tiles close to the
camera, compact neighbourhood tiles farther away and a lighter mesh for the
remaining districts. All three use the same mapped footprints and roof
height source. The wider meshes use fewer roof samples and omit recessed
openings. The neighbourhood budget is 12 tiles, 8 MiB compressed and 1 million
triangles. The city overview budget is 12 tiles, 12 MiB compressed and 1.5
million triangles. The edge of the streamed area blends into the imagery, and
the city geometry fades between zoom 12 and 11. OpenFreeMap extrusions provide
context beyond the city boundary. The renderer requests nearby tiles during pan
and zoom and keeps overlapping meshes visible while replacements load. Newly
covered areas fade in, and a lossless encoding reduces the size of the city
overview downloads. When you select a neuk hidden by an Edinburgh building,
the map turns around the pin if it finds a clear view. The build
matches mapped footprints with surveyed roof elevations. Buildings with
insufficient roof returns use mapped heights or typical heights for their type.
The surveyed terrain blends into the surrounding Mapzen elevation tiles.
The shaders give roofs and walls illustrative finishes. Shaded seams follow
shared walls in OpenStreetMap. Where a terrace has one outline and a consistent
row of mapped entrances or addresses, the map estimates divisions between them.
The Stockbridge preview adds recessed sash windows, dressed stone sills and
street-facing doors to selected rows around Malta Terrace, Saxe-Coburg Place
and Dean Terrace. Opening positions are estimated from the building footprints
and street alignment. The Saxe-Coburg details draw on the
[Historic Environment Scotland description](https://portal.historicenvironment.scot/apex/f?p=1505:300:::::VIEWTYPE,VIEWREF:designation,LB29763).
Within the Old Town and New Town conservation areas, the preview uses mapped
street alignment, entrances, shop locations and building levels to estimate
façade layouts. It gives Old Town tenements narrower window bays and New Town
terraces taller principal-floor sashes. Mapped street-level businesses guide
the position of shopfronts. The council's character appraisals describe the
[Old Town](https://www.edinburgh.gov.uk/directory-record/1099435/old-town-conservation-area)
and [New Town](https://www.edinburgh.gov.uk/directory-record/1099433/new-town-conservation-area).
Photo-traced windows and shops are available in the separate Princes Street
preview above.

The citywide compiler uses the [City of Edinburgh Council Localities boundary](https://city-of-edinburgh-council-open-spatial-data-cityofedinburgh.hub.arcgis.com/datasets/cityofedinburgh::edinburgh-council-localities-1)
and [Conservation Areas](https://city-of-edinburgh-council-open-spatial-data-cityofedinburgh.hub.arcgis.com/datasets/cityofedinburgh::conservation-areas)
under OGL v3, [OpenStreetMap footprints](https://www.openstreetmap.org/copyright)
from the 20 November 2026 Geofabrik Scotland snapshot under the ODbL, and
[Scottish Phase 5 LiDAR](https://registry.opendata.aws/scottish-lidar/) under OGL v3.
The geometry tiles generated from OpenStreetMap are available under the
[Open Database License](https://opendatacommons.org/licenses/odbl/).

Preview Edinburgh Castle from the
[Esplanade](http://127.0.0.1:4181/?lat=55.94853&lng=-3.19907&aerialPreview=1&buildings=edinburgh&landmark=castle)
or [Princes Street Gardens](http://127.0.0.1:4181/?lat=55.94887&lng=-3.20072&aerialPreview=1&buildings=edinburgh&landmark=castle-north).
The castle geometry uses mapped wall lines and the Gatehouse footprint, with
wall levels fitted to the 50 cm Scottish Phase 5 LiDAR. The arch, stonework
and other architectural details are original interpretations of openly
licensed exterior references. The geometry is baked into the standard
building tiles. Castle Rock uses a procedural basalt finish on steep faces
below the ramparts. It uses the 50 cm LiDAR and OpenStreetMap cliff and
bare-rock outlines to blend into the surrounding aerial imagery. See the
[castle source credits](public/data/edinburgh-buildings/castle-sources.txt).

To rebuild the rock finish, place the Phase 5 50 cm NT27SW and NT27SE grids
in a directory as `NT27SW-dtm.tif`, `NT27SW-dsm.tif`, `NT27SE-dtm.tif` and
`NT27SE-dsm.tif`. Full grids and crops covering the preview bounds both work.

```sh
python3 scripts/build-castle-rock.py /path/to/lidar .cache/scotland-latest.osm.pbf public/data/edinburgh-buildings/castle-rock.webp
```

To rebuild, use a fresh staging directory when changing source files.
The Python stage uses `osmium`, `shapely`, `rasterio`, `numpy` and `Pillow`.
The compiler writes the manifest, three mesh levels and terrain tiles.
Pass `--overview-only` or `--city-overview-only` after the output directory
to regenerate that mesh level from the prepared area.

```sh
python3 scripts/prepare-edinburgh-buildings.py .cache/scotland-latest.osm.pbf /tmp/neuk-edinburgh-stage
pnpm exec vite build --ssr scripts/build-edinburgh-meshes.ts --config scripts/edinburgh-build.vite.config.mjs --outDir /tmp/neuk-edinburgh-compiler
node /tmp/neuk-edinburgh-compiler/build-edinburgh-meshes.js /tmp/neuk-edinburgh-stage /tmp/neuk-edinburgh-output
```

Place the completed output in `public/data/edinburgh-buildings/` before building
the static export.

Use `buildings=edinburgh-pilot` on the Grassmarket, Stockbridge or Leith links
to compare the earlier browser-generated meshes. Regenerate those three
survey grids with `python3 scripts/build-waverley-lidar.py --edinburgh-pilot`.

Waverley Gate's façade texture is adapted from [Waverly Gate or Old GPO](https://commons.wikimedia.org/wiki/File:Waverly_Gate_or_Old_GPO.jpg)
by SylviaStanley under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

For a local visual catalogue, run `pnpm preview:parking-models`, then
`python3 -m http.server 4190 --bind 127.0.0.1 --directory output/parking-model-gallery`.
Open `http://127.0.0.1:4190/` to rotate every model, toggle covered and selected
states, compare image textures, and inspect dataset coverage. The gallery uses
the map's meshes and shaders. Its generated output stays outside the export.

Elevation loads only in 3D and is not included in offline-area downloads.
Unavailable elevation returns the map to 2D. Switching respects reduced motion.
Map-source credits appear as a plain line at startup, below the search bar on
phones and in the lower-right corner on desktop, then fade out after five
seconds. Full attribution links remain available in the Attributions panel.

## Current weather

**Weather** in Map layers shows an animated estimate for now, with the condition
and valid local time in the layer menu. It is off initially and remembers your
existing Rain preference. Drizzle, light, moderate and heavy rain vary in density,
streak length and falling speed. Snow falls as soft flakes and slowly tumbling six-armed crystals; mixed rain and snow,
freezing rain and thunderstorm hail have distinct particles. Thunderstorms show
an occasional branching white-blue lightning bolt within the forecast storm area, without
sound or full-screen flashes. Weather
stays anchored to the map in 2D, 3D and satellite views; reduced motion uses
static particles, fog and a static bolt. Fog and depositing-rime fog (WMO 45/48)
show gently drifting translucent wisps in the sampled fog areas, without
obscuring map controls. The effect is adapted from Trail
Atlas and is illustrative, not live radar, detected lightning strikes or a
precise boundary between weather conditions.

Open-Meteo supplies current liquid rain, showers, snowfall and WMO weather codes on a
quantized 20-point viewport grid, from local streets to whole-country views,
with tighter spacing when zoomed in. Wider views show a coarser illustration
of regional weather, not additional forecast detail. The app
normalizes liquid rain (mm) and snowfall (cm) separately using the reported
accumulation interval to control visual intensity. Weather codes use the nearest
sample rather than numeric interpolation, so a storm stays in its sampled area.
Requests contain public grid coordinates, never exact GPS or route points.
Weather shares regional Wind's per-tab request budget and Retry-After handling.
It refreshes every 15 minutes while visible, caches up to 12 areas in memory,
and removes estimates older than 30 minutes or when offline. Weather is not
added to offline downloads. Zoomed-out, unavailable and dry states are distinct.
While panning, fresh rain stays visible inside its sampled coverage as the next
area loads, and existing droplets continue smoothly when new data arrives.

Data and provider credits are in Attributions. The same Open-Meteo
non-commercial usage terms described below apply. Weather does not alter routes.

## Wind forecast

**Wind forecast** is available in Map layers, off by default. The Layers
button stays available while planning and hides during riding. Screen readers
announce “Turn on to load forecast” before the first request; loading, available,
stale and failed states remain distinct in accessible descriptions. Wind controls use
simple labels. Forecast timing remains available to screen readers; demo routes,
raw forecast-cell inspection and diagnostic links are not part of the app.
Unboxed slate-blue arrows
show where air travels (weather FROM direction +180°). Persistent MapLibre markers use subpixel positioning and move with the map in
the same camera update during panning, zooming and rotation. A buffered geographic
grid stays fixed throughout a gesture; membership and density update after it ends.
Nested geographic sampling, fixed icon size and collision filtering
keep arrows readable, with a fine stroke halo instead of white tiles. Circular
markers remain distinct cycling/location cues. Wind arrows do not encode speed
through size. Sparse labels show the estimated speed in km/h (or mph with Imperial units), rounded to one decimal. Half
the original geographic lattice is retained; a stable hash labels about one in
two arrows on desktop and one in three on mobile. Forecast arrows are interpolated samples, not extra provider cells, observations
or precise street-level speeds.

Route cards show total uphill elevation from CycleStreets street profiles beside
route distance, in metres or feet according to the units setting. Missing or
incomplete profiles omit climbing; flat and downhill-only routes show zero.
Saved planned routes retain climbing. The figure is a provider estimate, not an
effort or energy prediction.

Wind is controlled through Map layers and is fetched only while enabled. It does
not select or change a route. The experimental headwind preference is hidden
pending validation; its scoring utilities remain outside the app workflow.

The app loads **regional forecasts** through Open-Meteo across the app's UK, Ireland, Spain
(including the Balearics, Canaries, Ceuta and Melilla) and Armenia coverage.
Outside the original Edinburgh experiment, `best_match` selects available models;
resolution varies by region and is not presented as street-level detail.
The existing fine Edinburgh UKV grid remains for local Edinburgh views/journeys.

The app requests one 4×5 grid around the viewed area or all candidate routes,
with centres quantized to half-degree tiles for local views. Country views
spread the same 20 samples across a larger, padded grid; zooming back in loads
the finer local grid. Views overlapping a supported country work even when
the map centre is offshore. Valid overlapping forecasts remain visible while
the next grid loads, without extending their sampled coverage.
Only hourly 10 m wind speed/direction for the current day are requested.
These are map-region coordinates, never exact GPS fixes or route stops, although
requests reveal the broad region being viewed. Actual returned cells are
deduplicated. Signed airflow vectors are interpolated within neighbouring mesh
triangles; degenerate/folded areas and points outside the mesh are unsupported.
The map uses signed-vector sampling. No shelter or energy model is claimed.

Regional requests debounce for 800 ms, have a ten-second minimum interval, and
are capped at 10 requests/minute, 50/hour and 250/day per tab (20 locations per
request). Aborted/failed requests count too. HTTP 429 honours Retry-After with
at least a 30-minute pause. This local budget is not a production-wide quota
solution. Pan within a tile reuses its forecast; session caching retains at most
12 tile/hour entries, refreshes after 30 minutes and expires after two hours.
Forecast hours advance without relabelling the original fetch timestamp. Old
requests are aborted and cannot replace the newly selected region.

Views wider than 1.5 degrees do not automatically download weather. Long journeys
retain only the local map field; wind cannot change a route unless its entire
sampled geometry has coverage. Unsupported map centres do not request forecasts.
Regional request failure uses only a valid cache for that same region, otherwise
wind is unavailable. It never uses Edinburgh weather elsewhere. The legacy
Edinburgh-only grid may still use its explicitly labelled single-city fallback.
Missing, expired, variable or unsupported samples cannot change a route. Weather
changes clear comparisons outside active riding; riding geometry stays fixed.

Forecast validity remains in accessible descriptions. Credits are in the
existing Attributions dialog: [Open-Meteo](https://open-meteo.com/),
[CC BY 4.0 and model-provider credits](https://open-meteo.com/en/licence), and
UK Met Office [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
for Edinburgh UKV. Interpolation is an app-derived estimate. The API does not
supply model initialization time; a new fetch is not a new model run.

Wind is enabled on all hosts by default. Set `NEXT_PUBLIC_WIND_ENABLED=false`
before `pnpm build` to hide both wind controls, remove the overlay and prevent
weather requests, including when opening a route. Set it to `true` (or leave it
unset) to enable the feature. Other values disable it. This is a build-time flag:
changing it requires rebuilding and deploying the static export. No flag service
or hostname exception is needed.
For GitHub Actions deployments, set the repository variable
`NEXT_PUBLIC_WIND_ENABLED` to `false` before the next approved push to `main`.
The build runs in GitHub Actions, so changing only a Cloudflare Pages environment
variable does not change the deployed flag.

The non-commercial app uses Open-Meteo's free endpoint without an account or key.
[Open-Meteo's terms](https://open-meteo.com/en/terms) allow non-commercial public
apps without advertising or subscriptions, subject to their API limits. Commercial
use needs a paid plan. The per-tab request budget above does not enforce a shared
application quota; monitor usage before scaling. Missing weather leaves the map
and route planner usable, and historical or synthetic forecasts are never loaded.
Live smoke captures on 16 October 2026 verified Belfast, Dublin, Madrid, Palma,
Tenerife, Ceuta, Melilla, Yerevan, Glasgow, Cardiff and London. The dated fixture
is regression evidence only, never runtime current weather.
The [original Edinburgh comparison](docs/wind-provider-comparison.md) documents
that earlier experiment; its fixed-request policy is superseded here outside Edinburgh.
Existing council OGL and OpenStreetMap ODbL attribution is unchanged.

### Retired station research

The station snapshot experiment has been removed from the app. Its historical
capture, provenance, interpolation code and tests remain in
[`research/wind-stations/`](research/wind-stations/README.md), outside the static
export. The wind map uses the forecast providers only.

Automated checks exercise the normal forecast and routing flows with mocked
provider responses. Synthetic route geometry and dated forecast evidence live
under `test/fixtures/` and `src/lib/fixtures/`, outside the static export. The old
`windDemo` and `windStations` query parameters no longer activate special modes.

The retained experimental distance-weighted squared opposing-wind score reranks
available cycling routes in tests only; it is not connected to the planner. It requires at least 5% score improvement and
0.5 m/s mean opposing wind, at most 20% extra time and 25% extra distance,
no more than 300 m additional corridor deviation or 50 m additional
backtracking, matching endpoints within 35 m, and provider/geometry distance
consistency within 15%. It never switches to a less quiet provider style. There
are no same-style alternatives from the current provider response, so Quietest
will often have no eligible alternative. Calm, absent, stale, out-of-area or
unusable data leaves the route unchanged. The score is not an energy saving or
a claim that a route is safer.

## Live app

Open [neuk.bike](https://neuk.bike/). The deployed site currently runs on
Cloudflare Pages, with [neuk-bike.pages.dev](https://neuk-bike.pages.dev/) as
the provider URL and rollback entry point.

The app runs entirely in the browser. It has no backend, server database, paid
API, or server-side personal-location storage.

## WebMCP

Supporting browsers can use the imperative
[WebMCP API](https://webmachinelearning.github.io/webmcp/) to operate the same
finder as the user. Tools register client-side through
`document.modelContext.registerTool` and unregister when the finder unmounts.
Unsupported browsers continue to work without a polyfill or extra dependency.

| Tool                   | Effect                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `get_current_results`  | Read the current list (up to 20 entries), filters, place matches, selection and loading status. |
| `search_places`        | Send a place query to the existing Photon service and show the matches.                         |
| `select_place`         | Select a current match, remember the reference area locally and start loading nearby results.   |
| `show_parking_details` | Select an entry from the current list and show its details.                                     |
| `start_route_planning` | Open or resume the planner, preserving the existing draft and stopping active ride guidance.    |

Inputs are validated at execution time. Mutations finish committing their React
updates before returning; selecting a place starts asynchronous data loading,
whose status is available from `get_current_results`. Route planning only opens
the flow; it does not claim to have calculated or saved a route. These tools do
not request location permission, start GPS tracking, or write saved places.
Public map labels and descriptions are returned as untrusted content.

`e2e/webmcp.spec.ts` exercises these tools against the real finder with an
injected WebMCP registry, including mobile details, cancellation and unsupported
browsers. Native agent discovery requires a browser that implements this API.

## Quick start

```bash
pnpm install
pnpm dev
```

Then open the local URL printed by Next.js. The project requires Node.js 20 or
newer and uses pnpm.

## How it works

The generated parking release combines two free sources:

- City of Edinburgh Council public cycle-parking GeoJSON, preferred within
  Edinburgh
- OpenStreetMap `amenity=bicycle_parking` features from sequential Geofabrik
  extracts for the UK, Ireland, Spain, and Armenia, including a separate Canary
  Islands extract

The refresh script normalizes both sources, suppresses likely Edinburgh
duplicates in favour of council records, and writes source-qualified IDs such
as `cec:1234` and `osm:node:98765`. It derives useful display names offline from
OSM streets, junctions, nearby landmarks, and settlements when a source record
only says "Cycle parking". It then creates a content-addressed static release:

```text
public/data/parking/manifest.json
public/data/parking/chunks/12/{x}/{y}.{content-hash}.json
public/data/parking/indexes/point-index.{content-hash}.json
src/data/cycle-parking-report.json
```

The browser first loads the manifest and a 3×3 neighbourhood of zoom-12 chunks
around the current location. Map movement loads additional bounded chunks. A
24-chunk in-memory LRU cache prevents unbounded growth. The point index is only
loaded when a `?parking=` deep link needs it. The full UK-Ireland-Spain-Armenia
dataset is not included in the JavaScript bundle.

The UK National Cycle Network is a separate official Walk Wheel Cycle Trust
snapshot. The browser loads only nearby content-addressed zoom-10 chunks and
keeps them behind a persistent Map layers switch. Traffic-free, on-road,
ferry, and temporarily closed segments are styled distinctly. In 3D or satellite
views, brighter, wider lines with a light casing and dark outer edge keep the
network readable over terrain and imagery. Numbered routes
use compact repeated shields, while route popups present route type, confirmed
surface, ride quality, and lighting in a compact translated fact grid using the
same icon language as parking details. The layer is not shown outside published
UK coverage and never changes route calculation.

OpenStreetMap drinking-water points share the lazy-loaded cycling-place
release. They stay off by default and appear as blue droplet markers when the
Drinking water switch is enabled in Map layers. Selecting a point shows its
distance and a Directions action without replacing or reranking the nearby
parking list. The layer choice is stored only in the current browser.

On the first visit, the app requests location once after loading the parking
finder. While browser permission is granted, returning visits refresh GPS
without another permission prompt. Dismissing the dialog suppresses automatic
requests for 24 hours; denying permission stops automatic requests until the
user retries with the location button beside search or grants access in browser
settings. Permission lifetime remains browser-controlled. When storage is
blocked, the location button still works, but the app does not automatically
prompt because it cannot reliably remember an earlier request.

The last successful in-coverage GPS fix is cached locally for up to 24 hours.
Searched places, opened offline areas, and areas reached by manually moving the
map are remembered separately until replaced or site data is cleared. On return,
shared links take precedence, followed by the last browsed area, a valid cached
GPS reference, and central Edinburgh. Denying GPS clears its cached fix but keeps
the browsed area. Automatic map focus and route navigation do not overwrite it.
A failed GPS refresh preserves an available reference. Restored areas and cached
GPS appear as reference markers, never as live GPS or automatic route origins.
Expired or invalid GPS cache records are discarded.

The header has no persistent location status row. The location button provides
manual retry, with concise feedback after an explicit request fails. Only a
confirmed GPS fix uses the blue location marker. The dark basemap increases
street, path, and label contrast while preserving route overlays and path patterns.
Failed map styles and tiles retry up to three times with increasing delays.
Reopening the PWA or reconnecting restarts recovery for outstanding failures;
healthy maps only resize and repaint. Recovery preserves the camera and app
state. A stalled style request falls back to the local background after 12
seconds. Offline streets still require a downloaded area.
After a WebGL context reset, the map rebuilds its GPU resources and restores the
camera, selected parking, map layers and active route without reloading the page.
MapLibre workers and their shared module use versioned URLs generated during
install and Next.js startup/build, so a PWA update cannot reuse workers from a
different MapLibre release.
The map's “Plan a route” button opens destination search in the same map and sheet. The sliders
icon beside Parking opens parking preferences. Route planning is also available
from the existing menu.
Place search uses Photon and OpenStreetMap data. After three characters it
loads suggestions automatically, while Enter and the desktop Search button
remain available as explicit fallbacks. Results are filtered through the same
country-boundary polygons as the parking data.

Directions use the CycleStreets v2 API from the browser. Riders can compare
quietest, balanced, and fastest routes by estimated time and distance before
starting; balanced is selected by default. Add a public API key to `.env.local`
for local development:

```bash
NEXT_PUBLIC_CYCLESTREETS_API_KEY=your_key_here
```

Parking directions and route planning share a compact journey preview. Choose a
destination first; confirmed GPS can supply the start. If GPS is unavailable or
the map is showing a shared/search reference, choose a start or explicitly use
location. The reference location is never silently used as a route origin.
The preview offers route styles, live tracking, directions and saving. Back
returns to parking with the selection and discovery camera preserved; “Resume
route” restores the draft during the current visit. Save a route to retain it
across visits. Select the labelled Start or Destination row to change that endpoint by place search
or **Choose on map**, then click or tap the exact point. Each search step edits
only its named endpoint; the other selected endpoint appears as read-only context.
Cancel returns without
changing the route. “Edit route” also lets you replace either endpoint directly,
and exposes naming, reordering and up to 30 stops, from
place search or an explicit tap-on-map mode. Changing the destination preserves
start and via points. **Finish at bike parking** appears once the route is ready and
compares up to three neuks near the current destination using route time and
distance, distance from the destination, capacity, cover, access, and stand
type. The original destination remains unchanged until a neuk is confirmed, and
remains available as a one-tap fallback. When route comparison is unavailable,
nearby parking and mapped details still remain selectable. The selected route,
including its stops, geometry, instructions, distance, and duration, is saved
to IndexedDB on the current device. Saved routes can be
reopened and exported or shared as GPX without recalculation. GPX files can also
be reviewed and imported locally; their exact track segments are preserved, but
they do not gain invented route preferences or turn-by-turn directions. Planned
routes can be shared as compact links containing only their stops and route
preference in the URL fragment. Route calculation and place search still
require a connection, and clearing browser site data removes the local route
library.

While riding, the next-turn card shows the distance to the next instruction and
remaining route distance. **Recalculate route** appears when GPS is off-route;
it uses the current position, preserves the selected route style and destination,
and retains via stops not yet passed on the route. Recalculation needs a connection
and keeps the original route if it fails. Stopping or leaving the ride invalidates
pending recalculation results.

Starting a ride automatically keeps the screen awake where the browser supports
it. The wake lock releases on arrival, stop or leaving navigation, and is
requested again when the page returns to the foreground. If it is unavailable,
the riding screen explains that the screen may turn off.

Spoken turn guidance starts automatically using an on-device voice for the chosen
language. The speaker button inside the next-turn panel mutes or unmutes guidance;
the choice is remembered on this device. No ride controls appear while planning.
If speech is blocked, the speaker button can retry from a tap. No route text is
sent to a remote speech service.

Use the route button beside **My location** to plan or resume a route. Open
**My routes** in the Bike Neuk menu to reopen routes saved on the current device;
**New route** inside that screen opens the planner. The normal Nearby sheet
remains dedicated to finding cycle parking and other cycling places.

Armenia routing was verified with a live Yerevan journey that returned route
geometry and Armenian street instructions. The app keeps its existing external
Google Maps action as an alternative.

Street View previews are optional. Add a restricted public browser key:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY=your_embed_key_here
```

These keys are bundled into the static app because there is no backend. Restrict
the Google key to the Maps Embed API and the app's allowed HTTP referrers.

Production builds use PostHog only when `NEXT_PUBLIC_POSTHOG_KEY` is configured.
Analytics are disabled on local and loopback hosts by default. Cookieless
journey events use temporary random identifiers, with no route coordinates,
place names, parking IDs, or URL query/fragment data. See
[the analytics contract](docs/analytics.md) for event definitions and reporting.

## Language and units settings

Open the settings menu to switch between English, Scottish Gaelic
(`Gàidhlig`), Spanish (`Español`), and Armenian (`Հայերեն`). The choice is
stored only in the browser and is reused on the next visit. On a first visit
the app uses the first supported browser language, then falls back to English.

The Units setting defaults to Metric (metres/kilometres and km/h). Choose
Imperial for feet/miles and mph. This browser-only preference is remembered
across visits and applies to wind, parking distances, routes and guidance.
Forecast vectors, saved routes and routing thresholds keep their SI values.

The translated interface, parking-name templates, route instructions, and
number formatting are bundled into the static app. Street and place names,
brand names, source attribution, and licence text stay unchanged. Place search
uses English results for the English interface and local place names for
Gaelic, Spanish, and Armenian. Armenian uses Photon's local-name response
because Photon does not accept `hy` as a response-language value.

## Commands

```bash
pnpm test          # focused Vitest suite
pnpm test:e2e      # desktop and mobile workflows against a static export
pnpm test:analytics # intercepted PostHog payload and journey checks
pnpm refresh:data  # download, stage, verify and install all three datasets
pnpm check:data --upstream # source age and upstream publication metadata
pnpm lint
pnpm format
pnpm build         # writes the static site to out/
pnpm deploy:cloudflare # builds and deploys out/ to Cloudflare Pages
pnpm update:data   # refreshes council + OSM data and generated chunks
pnpm update:pois   # refreshes UK-Ireland-Spain-Armenia cycling places
pnpm verify:pois   # verifies POI chunks, hashes, IDs, counts, and coverage
pnpm update:network # refreshes the official UK National Cycle Network
pnpm verify:network # verifies network chunks, hashes, counts, and budgets
```

Install the Playwright browser once before the E2E suite if needed:

```bash
pnpm exec playwright install chromium
```

Offline-area E2E tests use local deterministic OpenFreeMap-shaped fixtures, so
the routine suite does not prefetch from the public provider. To run the
rate-limited real-provider smoke test explicitly:

```bash
OPENFREEMAP_SMOKE=1 pnpm exec playwright test e2e/offline-openfreemap-live.spec.ts
```

## Dataset refresh

Use `pnpm refresh:data` for a consistent release of parking, cycling places,
and NCN. Fresh acquisition is the default. `--cached` explicitly rebuilds
OSM data from existing inputs; it does not make their source dates newer.
Fresh refreshes validate and pin all dated OSM publications once per invocation,
then download those files and require matching same-run hashes for POI reuse.
The plan expires after two hours; all source-age, completeness and full-PBF
checks still apply. Refresh artifacts describe preflight publications without
re-fetching metadata after the build. Upstream files and other feeds must still
remain available. Single-dataset commands remain available, and `pnpm check:data` flags
parking/POI input mismatches. Partial region releases are rejected.

Geofabrik downloads and upstream checks share a validated dated-file fallback
when a `-latest.osm.pbf` alias fails or redirects incorrectly. The region's
official publication page supplies the current dated filename and OSM cutoff.
When the catalogue displays a rounded size, the exact `Content-Length` must
agree with the range total or the length of an ordinary download response.
Bounded header probes verify the cutoff, and full downloads must pass size,
PBF framing and
compressed-block validation before replacing a cached input. Stale, future,
mixed-age or incomplete OSM releases cannot replace the current release.

Monthly refreshes start at 21:23 UTC on the first and use
`pnpm refresh:data --wait-for-sources` to wait up to four hours for temporary
publication/download availability problems. Every attempt revalidates all 70
inputs before pinning a complete plan; its two-hour
expiry starts with that successful attempt. Weekly upstream checks use
`pnpm check:data --upstream --wait-for-sources` to retry for up to one hour.
The job has a six-hour total limit. A failed or incomplete refresh keeps the
previous release, produces diagnostics, and never packages a partial release.

The attribution panel shows underlying source dates;
`public/data/freshness.json` records per-input dates, hashes and retrieval times.
See [data maintenance](docs/data-maintenance.md) for scheduled review artifacts,
refresh recovery and validation.
The weekly source check runs Friday at 06:23 UTC; GitHub may delay scheduled
runs. See the [30 October review](docs/weekly-review-action-plan-2026-10-30.md)
for the latest maintenance findings, weather measurement and security updates.

The cycling-place release keeps bicycle shops, repair facilities, hire
locations, and drinking-water points in a separate lazy-loaded release under
`public/data/cycling-pois/`. Run `pnpm update:pois` to rebuild the full UK,
Ireland, Spain, and Armenia coverage with fresh Geofabrik extracts. Use
`pnpm refresh:data` to refresh parking and places from exactly the same inputs. Inputs are processed sequentially, overlapping regional OSM
IDs are deduplicated, and the generated report records per-input checksums,
counts, source timestamps, resource usage, and static-asset budgets. Parking
remains the default and continues to use the independent release described
below.

`pnpm update:network` pages through the official National Cycle Network
FeatureServer, validates its schema and record count, normalizes route
classification, status, surface, ride quality, and lighting, then atomically
replaces
`public/data/cycle-network/`. The generated release contains 37,207 segments in
423 zoom-10 chunks. Its largest asset is about 448 KiB and the measured maximum
compressed 3×3 payload is about 557 KiB. Run `pnpm verify:network` after a
refresh and treat `src/data/cycle-network-report.json` as the current snapshot
report. Do not hand-edit these generated files.

The current cycling-place release contains 68,229 unique OpenStreetMap places
in 8,395 chunks: 4,131 shops, 2,667 repair locations, 8,059 hire locations,
and 54,897 drinking-water points. Its 8,397 generated files contain about 15.8
MiB of JSON; the largest possible initial 3×3 chunk payload is about 79 KiB
compressed. The category totals overlap because one place can explicitly
support more than one service.

`pnpm update:data` performs the complete release pipeline:

1. fetch the current City of Edinburgh Council public GeoJSON;
2. download fresh Scotland, Wales, Ireland-and-Northern-Ireland, Canary
   Islands, and Armenia PBFs plus 47 England county and 18 Spain regional PBFs
   from Geofabrik;
3. process each region sequentially so contextual naming stays memory-bounded;
4. extract bicycle-parking nodes, ways, and relations;
5. normalize fields, representative geometry, and descriptive names;
6. deduplicate overlapping county extracts by source-qualified OSM ID;
7. merge likely Edinburgh duplicates with deterministic council priority;
8. download or reuse the England, Scotland, Wales,
   Ireland-and-Northern-Ireland, Spain, Canary Islands, and Armenia Geofabrik
   coverage polygons;
9. stage `public/data/parking/` with a schema-v2 manifest,
   content-addressed chunks, and point index;
10. enforce file, asset, initial-payload, and total-data hard budgets;
11. write the council snapshot and detailed quality report under `src/data/`;
12. verify the complete output, write freshness metadata, and install the staged
    release with rollback if promotion fails.

The cached inputs currently occupy about 3.9 GB and are ignored by Git. The
first refresh depends on Geofabrik download speed and bounded retry delays; a
cached parking or cycling-place refresh avoids those downloads. The generated
reports record source
timestamps, per-input SHA-256 checksums and elapsed time, geometry counts,
field completeness, naming-tier counts and samples, discarded features,
cross-region duplicate IDs, council/OSM matches, peak memory, and output-size
budgets.

The current generated release contains 88,879 merged parking points in 4,426
chunks. It includes 1,454 council points and 88,821 unique OSM records, with 221
cross-region OSM duplicates removed and 1,396 likely Edinburgh duplicates
suppressed in favour of council records. The parking release is about 27.2 MiB;
the largest possible initial 3×3 payload is about 484 KiB compressed. Treat
these as a snapshot: `public/data/parking/manifest.json` and
`src/data/cycle-parking-report.json` are the source of truth after a refresh.

Do not hand-edit `src/data/cycle-parking.json`, the report, or generated chunks.
Change the normalizer or merge rules and rerun the refresh.

Sources:

- [City of Edinburgh Council cycle parking](https://www.edinburgh.gov.uk/cycling-walking/cycle-parking)
- [Council Public Bike Parking FeatureServer](https://services-eu1.arcgis.com/FgpikkYuSUOuITxp/arcgis/rest/services/Public_Bike_Parking/FeatureServer/0)
- [Geofabrik England extract and county inputs](https://download.geofabrik.de/europe/united-kingdom/england.html)
- [Geofabrik Scotland extract](https://download.geofabrik.de/europe/united-kingdom/scotland.html)
- [Geofabrik Wales extract](https://download.geofabrik.de/europe/united-kingdom/wales.html)
- [Geofabrik Ireland and Northern Ireland extract](https://download.geofabrik.de/europe/ireland-and-northern-ireland.html)
- [Geofabrik Spain regional extracts](https://download.geofabrik.de/europe/spain.html)
- [Geofabrik Canary Islands extract](https://download.geofabrik.de/africa/canary-islands.html)
- [Geofabrik Armenia extract](https://download.geofabrik.de/asia/armenia.html)

## Offline behaviour

The service worker caches the app shell and previously visited data. For a
predictable trip download, open **Offline areas** from the Bike Neuk menu,
choose **Download this area**, then pan and zoom the highlighted map selection.
The confirmation shows the estimated size and refresh date for each available
dataset. Completed areas are kept in a dedicated cache that survives routine
app updates and can be viewed, updated, or removed from the same panel.

Explicit areas include the bounded OpenFreeMap background through zoom 14,
cycle parking, cycling shops, repair, hire and drinking water, plus National
Cycle Network geometry where that dataset has coverage. The current
OpenFreeMap support is deliberately experimental while Bike Neuk is small and
unpublished; review the provider policy before a public launch or higher-volume
use.

Downloads are stored by the browser on the current device. Each area is capped
at 100 MB, with up to five areas and 500 MB in total. Bike Neuk keeps 20% of
the browser-reported quota free, downloads at most two OpenFreeMap resources at
a time, and limits request starts to about five per second. Downloads never
start or update automatically. Bike Neuk requests persistent storage when
supported, but the browser may still remove site data under storage pressure or
when site data is cleared. It recommends refreshing an area after 30 days and
marks it stale after 90 days, without deleting or disabling it.

If a downloaded background is unavailable, Bike Neuk switches to a simple
local background while continuing to show downloaded cycling data. Live place
search, new CycleStreets route calculation, Street View, and areas that were
not downloaded still need a network connection. Saved routes retain their
existing local geometry and instructions.

## Sharing

Parking links use a stable query such as `/?parking=cec%3A1`. The point index
loads the correct spatial chunk even when the stand is not near the current map
view. Legacy Edinburgh IDs such as `?parking=1` are resolved to their `cec:` ID.

The static build deliberately does not create one HTML page and SVG social
image per parking point. Regular sharing works, but every stand uses the site's
general social preview.

## Mock GPS

On localhost or a loopback host, add mock GPS parameters for browser testing:

```text
/?parking=cec%3A1&mockGps=55.9406042783081,-3.29451047885751,5
/?parking=cec%3A1&mockGpsPath=55.94055,-3.29460,5;55.9406042783081,-3.29451047885751,5&mockGpsStepMs=1000
/?parking=cec%3A1&mockGps=denied
/?parking=cec%3A1&mockGps=unavailable
/?mockGps=40.4168,-3.7038,5
/?mockGps=28.1235,-15.4363,5
/?mockGps=40.1777,44.5126,5
/?mockGps=40.7869,43.8382,5
/?mockGps=null-island
```

Production hosts always use the browser geolocation API.

## Deployment

### Production: Cloudflare Pages

Cloudflare Pages is the production host for this static app.
It can serve the existing `out/` directory directly, adds edge delivery and
compression, and applies the cache and security policy in `public/_headers`.
No Worker runtime, database, paid API, or new application dependency is needed.
The custom domain is [neuk.bike](https://neuk.bike/), and the same deployment
is available at [neuk-bike.pages.dev](https://neuk-bike.pages.dev/).

The existing `neuk-bike` Pages project uses Direct Upload. Successful pushes to
`main` run the GitHub Actions quality checks, rebuild the production export with
the repository's public environment secrets, and deploy `out/` to Cloudflare
with Wrangler. Pull requests run the same quality checks without deploying.

The deployment job requires these GitHub Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`, scoped to Account > Cloudflare Pages > Edit
- `NEXT_PUBLIC_CYCLESTREETS_API_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `NEXT_PUBLIC_POSTHOG_KEY`

The repository also includes `wrangler.jsonc` and a repeatable manual fallback.
Create a new Direct Upload project only when bootstrapping a separate host:

```bash
pnpm exec wrangler pages project create neuk-bike --production-branch main
```

Deploy manually when the automatic workflow is unavailable with:

```bash
pnpm deploy:cloudflare
```

This builds locally with the existing public environment variables and uploads
the unchanged `out/` export. Verify both the generated `pages.dev` URL and
`neuk.bike` after every production deployment. Cloudflare Pages deployment
history and the provider URL provide the rollback path.
See Cloudflare's [static Next.js guide](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/)
and [custom header documentation](https://developers.cloudflare.com/pages/configuration/headers/).

### Previous host: GitHub Pages

GitHub Pages was retired after the Cloudflare custom domain, HTTPS, environment
features, caching, and PWA behaviour were verified. Pull requests run the
GitHub Actions quality checks, and successful pushes to `main` deploy the static
export to the existing Cloudflare Pages Direct Upload project.

## Attribution

Council records:

```text
Copyright City of Edinburgh Council, contains Ordnance Survey data (c) Crown copyright and database right 2026.
```

- [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)

OpenStreetMap-derived records and map/search data:

- Data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
  available under the [Open Database Licence 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- [Photon](https://photon.komoot.io/)

National Cycle Network:

- [Walk Wheel Cycle Trust National Cycle Network](https://www.arcgis.com/home/item.html?id=5defd254e78745bfb12d0456abc1bcf1),
  available under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)

Cycle directions:

- [CycleStreets](https://www.cyclestreets.net/)

## License

This project is released under the [MIT License](./LICENSE).

## Brand assets

The approved cream bicycle on teal is used by the desktop and mobile menus,
favicons, installed app icons and social previews. See [the artwork notes](assets/brand/README.md)
for the original reference, vector source and regeneration command.
