# Edinburgh Cycle Parking

Static, mobile-friendly Next.js app for finding nearby City of Edinburgh Council cycle parking.

The app has no backend. It ships a normalized copy of the public ArcGIS Cycle Parking dataset and sorts locations in the browser using the Geolocation API when the user shares their current location.

## Development

```bash
pnpm install
pnpm dev
```

Common checks:

```bash
pnpm test
pnpm lint
pnpm format
pnpm build
```

## Dataset

Refresh the static dataset with:

```bash
pnpm update:data
```

The script downloads GeoJSON from the City of Edinburgh Council ArcGIS service, normalizes it, and writes `src/data/cycle-parking.json`.

Source:

```text
https://services-eu1.arcgis.com/FgpikkYuSUOuITxp/arcgis/rest/services/Cycle_Parking/FeatureServer/46/query?where=1%3D1&outFields=*&outSR=4326&f=geojson
```

Dataset attribution:

```text
Copyright City of Edinburgh Council, contains Ordnance Survey data (c) Crown copyright and database right 2026.
```

Licence: [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

## Deployment

The app is configured for GitHub Pages project hosting.

Local static export:

```bash
pnpm build
```

On GitHub Actions the deploy workflow sets `GITHUB_PAGES=true`, which enables the `/edinburgh-cycle-parking` base path and publishes the generated `out/` directory.
