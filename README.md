# Bike Neuks

<p align="center">
  <img src="./public/icon-192.png" alt="Bike Neuks icon" width="140" />
  <br />
  <a href="https://neuk.bike/">
    <img src="https://img.shields.io/badge/live-Cloudflare%20Pages-0f766e" alt="live app" />
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="license" />
  </a>
  <br />
  Static, mobile-friendly map for finding nearby cycle parking across the UK, Ireland and Spain.
</p>

## Features

- Find nearby cycle parking from your current location in the UK, Ireland or
  Spain
- Search from a UK, Irish or Spanish street, postcode, town, or place
- Browse a map-first interface without an app account or backend
- Show cycle directions to a selected parking place with CycleStreets
- See capacity, access, cover, and stand type when mapped
- Share parking places with source-qualified `?parking=` links
- Install the app as a Progressive Web App
- Reuse previously visited parking chunks offline
- Use the interface in English, Scottish Gaelic, or Spanish

## Live app

Open [neuk.bike](https://neuk.bike/). The deployed site currently runs on
Cloudflare Pages, with [neuk-bike.pages.dev](https://neuk-bike.pages.dev/) as
the provider URL and rollback entry point.

The app runs entirely in the browser. It has no backend, database, paid API, or
personal-location storage.

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
  extracts for the UK, Ireland and Spain, including a separate Canary Islands
  extract

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
loaded when a `?parking=` deep link needs it. The full UK-Ireland-Spain
dataset is not included in the JavaScript bundle.

If geolocation is unavailable or the requested location is outside the UK,
Ireland and Spain, the app falls back to central Edinburgh and explains what
happened.
Place search uses Photon and OpenStreetMap data. After three characters it
loads suggestions automatically, while Enter and the desktop Search button
remain available as explicit fallbacks. Results are filtered through the same
country-boundary polygons as the parking data.

Directions use the CycleStreets v2 API from the browser. Add a public API key to
`.env.local` for local development:

```bash
NEXT_PUBLIC_CYCLESTREETS_API_KEY=your_key_here
```

Street View previews are optional. Add a restricted public browser key:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY=your_embed_key_here
```

These keys are bundled into the static app because there is no backend. Restrict
the Google key to the Maps Embed API and the app's allowed HTTP referrers.

Production builds use PostHog only when `NEXT_PUBLIC_POSTHOG_KEY` is configured.
Analytics are disabled on local and loopback hosts by default.

## Language setting

Open the settings menu to switch between English, Scottish Gaelic
(`Gàidhlig`), and Spanish (`Español`). The choice is stored only in the
browser and is reused on the next visit. On a first visit the app uses the
first supported browser language, then falls back to English.

The translated interface, parking-name templates, route instructions, and
number formatting are bundled into the static app. Street and place names,
brand names, source attribution, and licence text stay unchanged. Place search
uses English results for the English interface and local place names for Gaelic
and Spanish, matching the languages supported by the public Photon service.

## Commands

```bash
pnpm test          # focused Vitest suite
pnpm test:e2e      # desktop and mobile workflows against a static export
pnpm lint
pnpm format
pnpm build         # writes the static site to out/
pnpm deploy:cloudflare # builds and deploys out/ to Cloudflare Pages
pnpm update:data   # refreshes council + OSM data and generated chunks
pnpm update:pois   # refreshes UK-Ireland-Spain cycling places
pnpm verify:pois   # verifies POI chunks, hashes, IDs, counts, and coverage
```

Install the Playwright browser once before the E2E suite if needed:

```bash
pnpm exec playwright install chromium
```

## Dataset refresh

The category-chip release keeps bicycle shops, repair facilities, and hire
locations in a separate lazy-loaded release under
`public/data/cycling-pois/`. Run `pnpm update:pois` to rebuild the full UK,
Ireland, and Spain coverage from the same cached Geofabrik extracts used by
parking. Inputs are processed sequentially, overlapping regional OSM IDs are
deduplicated, and the generated report records per-input checksums, counts,
source timestamps, resource usage, and static-asset budgets. Parking remains
the default and continues to use the independent release described below.

The current cycling-place release contains 13,176 unique OpenStreetMap places
in 2,474 chunks: 4,087 shops, 2,577 repair locations, and 8,006 hire
locations. Its 2,476 generated files occupy about 3.6 MiB; the largest possible
initial 3×3 chunk payload is about 36 KiB compressed. The category totals
overlap because one place can explicitly support more than one service.

`pnpm update:data` performs the complete release pipeline:

1. fetch the current City of Edinburgh Council public GeoJSON;
2. download or reuse the Scotland, Wales, Ireland-and-Northern-Ireland, and
   Canary Islands PBFs plus 47 England county and 18 Spain regional PBFs from
   Geofabrik;
3. process each region sequentially so contextual naming stays memory-bounded;
4. extract bicycle-parking nodes, ways, and relations;
5. normalize fields, representative geometry, and descriptive names;
6. deduplicate overlapping county extracts by source-qualified OSM ID;
7. merge likely Edinburgh duplicates with deterministic council priority;
8. download or reuse the England, Scotland, Wales, Ireland-and-Northern-Ireland,
   Spain, and Canary Islands Geofabrik coverage polygons;
9. replace `public/data/parking/` with a schema-v2 manifest,
   content-addressed chunks, and point index;
10. enforce file, asset, initial-payload, and total-data hard budgets;
11. write the council snapshot and detailed quality report under `src/data/`.

The cached inputs currently occupy about 3.9 GB and are ignored by Git. The
first refresh depends on Geofabrik download speed and bounded retry delays; a
cached parking or cycling-place refresh avoids those downloads. The generated
reports record source
timestamps, per-input SHA-256 checksums and elapsed time, geometry counts,
field completeness, naming-tier counts and samples, discarded features,
cross-region duplicate IDs, council/OSM matches, peak memory, and output-size
budgets.

The current generated release contains 87,611 merged parking points in 4,342
chunks. It includes 1,454 council points and 87,555 unique OSM records, with 216
cross-region OSM duplicates removed and 1,398 likely Edinburgh duplicates
suppressed in favour of council records. The parking release is about 26.7 MiB;
the largest possible initial 3×3 payload is about 491 KiB compressed. Treat
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

## Offline behaviour

The service worker caches the app shell. The manifest uses network-first
caching, while immutable versioned parking chunks and the point index use
cache-first behaviour. Previously visited areas can therefore remain useful
offline, but the app does not promise UK-Ireland-Spain-wide offline
coverage.

Live place search, CycleStreets directions, uncached map tiles, and uncached
parking areas still need a network connection.

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

Cycle directions:

- [CycleStreets](https://www.cyclestreets.net/)

## License

This project is released under the [MIT License](./LICENSE).
