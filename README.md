# Edinburgh Cycle Parking

<p align="center">
  <img src="./public/icon-192.png" alt="Edinburgh Cycle Parking icon" width="140" />
  <br />
  <a href="https://tom-auger.github.io/edinburgh-cycle-parking/">
    <img src="https://img.shields.io/badge/live-GitHub%20Pages-0f766e" alt="live app" />
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="license" />
  </a>
  <br />
  Static, mobile-friendly map for finding nearby City of Edinburgh Council cycle parking.
</p>

## Features

- Find the closest cycle parking from your current location
- Search from a street, postcode, or place in Edinburgh
- Browse nearby parking on an interactive Leaflet map
- Show cycle directions to a selected parking space with CycleStreets
- See parking details such as capacity, access, cover, and stand type when the source data includes them
- Share a reference location with `?lat=` and `?lng=` URL parameters
- Install the app as a Progressive Web App
- Use the app shell and bundled parking data offline after the first successful load

## Live App

Open the app at:

- https://tom-auger.github.io/edinburgh-cycle-parking/

The app runs entirely in the browser. It has no backend, database, tracking service, or server API.

## Quick Start

Install dependencies:

```bash
pnpm install
```

Start the local development server:

```bash
pnpm dev
```

Then open the local URL printed by Next.js.

This project requires Node.js 20 or newer and uses pnpm for package management.

## How It Works

The app ships a normalized copy of the public City of Edinburgh Council Cycle Parking ArcGIS dataset in `src/data/cycle-parking.json`.

On load, it asks for your browser location and sorts the bundled parking records by distance. If geolocation is unavailable or denied, it falls back to central Edinburgh. Place search uses Nominatim and OpenStreetMap data when you search for a street, postcode, or place.

Directions use the CycleStreets v2 API from the browser. Add a public API key to `.env.local` for local development:

```bash
NEXT_PUBLIC_CYCLESTREETS_API_KEY=your_key_here
```

This key is bundled into the static app because the project has no backend or proxy.

Map rendering is kept client-side so the app remains compatible with static export and GitHub Pages.

## Commands

Run the focused test suite:

```bash
pnpm test
```

Check lint:

```bash
pnpm lint
```

Check formatting:

```bash
pnpm format
```

Build the static export:

```bash
pnpm build
```

Refresh the bundled parking dataset:

```bash
pnpm update:data
```

## Dataset

The data refresh script downloads GeoJSON from the City of Edinburgh Council ArcGIS service, normalizes each feature, sorts records by name, and rewrites `src/data/cycle-parking.json`.

Source:

```text
https://services-eu1.arcgis.com/FgpikkYuSUOuITxp/arcgis/rest/services/Cycle_Parking/FeatureServer/46/query?where=1%3D1&outFields=*&outSR=4326&f=geojson
```

The generated dataset currently includes:

- 1,462 cycle parking records
- Source URL, attribution, licence URL, refresh timestamp, and record count metadata
- Latitude, longitude, display name, stable ID, and cleaned source properties for each point

Treat `src/data/cycle-parking.json` as generated data. Update the normalizer in `scripts/update-cycle-parking-data.mjs` before refreshing the output when the source shape changes.

## Offline Behavior

After the first successful load, the app shell and bundled parking data are available offline through the service worker.

Live place search, CycleStreets directions, and uncached OpenStreetMap tiles still need a network connection.

## Deployment

The app is configured for GitHub Pages project hosting.

Local static export:

```bash
pnpm build
```

On GitHub Actions, the deploy workflow sets `GITHUB_PAGES=true`. That enables the `/edinburgh-cycle-parking` base path and asset prefix, then publishes the generated `out/` directory.

## Attribution

Cycle parking data:

```text
Copyright City of Edinburgh Council, contains Ordnance Survey data (c) Crown copyright and database right 2026.
```

Licence:

- [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)

Map tiles and place search:

- [OpenStreetMap](https://www.openstreetmap.org/copyright)
- [Nominatim](https://nominatim.openstreetmap.org/)

Cycle directions:

- [CycleStreets](https://www.cyclestreets.net/)

## License

This project is released under the [MIT License](./LICENSE).
