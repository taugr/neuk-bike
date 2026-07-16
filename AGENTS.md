# AGENTS.md

## Project Shape

- This is a static, backend-free Next.js app for finding cycle parking across Scotland.
- The generated release combines City of Edinburgh Council data with
  OpenStreetMap coverage from the Geofabrik Scotland extract.
- Runtime parking data is loaded from versioned zoom-12 chunks under
  `public/data/parking/`; there is no database or server API.
- `src/data/cycle-parking.json` is the generated council snapshot, while
  `src/data/cycle-parking-report.json` is the generated quality report.
- The main user experience lives in `src/components/cycle-parking-finder.tsx` and `src/components/cycle-parking-map.tsx`.
- Shared behavior belongs in `src/lib/`, with focused tests near the changed code.

## Commands

- Use `pnpm` for project commands. Do not switch package managers.
- Development server: `pnpm dev`.
- Narrow tests: `pnpm test` or a focused Vitest invocation when appropriate.
- Common checks: `pnpm test`, `pnpm lint`, `pnpm format`, and `pnpm build`.
- Auto-fix commands are available as `pnpm lint:fix` and `pnpm format:fix`; use them only when the task calls for edits.

## Dataset

- Refresh cycle parking data with `pnpm update:data`.
- The refresh script downloads public council GeoJSON, downloads or reuses the
  cached Scotland PBF, normalizes and merges both sources, derives contextual
  names offline, and rewrites the generated snapshot, report, manifest, chunks,
  and point index.
- Treat `src/data/cycle-parking.json`, `src/data/cycle-parking-report.json`, and
  `public/data/parking/` as generated data. Do not hand-edit generated records.
- When changing the normalizer or merge/naming rules, inspect record counts,
  geometry and completeness results, naming-tier counts and samples, source
  timestamps, checksum, discarded features, and duplicate matches before
  committing the regenerated output.
- Preserve City of Edinburgh Council OGL and OpenStreetMap ODbL attribution in
  README-facing and in-app documentation.

## Frontend Guidance

- Keep the app mobile-friendly and map-first. Avoid landing-page or marketing-style layouts.
- Browser-only APIs such as geolocation, `window.location`, and Leaflet must stay behind client-side boundaries.
- `react-leaflet` map code should remain dynamically loaded or otherwise isolated from server rendering.
- Keep user-facing copy short, concrete, and non-technical.
- When touching location, search, map, or responsive UI behavior, verify in a browser when practical.

## Deployment

- The app uses static export via `next.config.ts`.
- Cloudflare Pages is the preferred production host and serves the generated
  `out/` directory as static assets. `public/_headers` defines its caching and
  security policy.
- GitHub Pages remains the fallback until the Cloudflare `pages.dev` deployment,
  custom domain, HTTPS, environment-dependent features, and PWA are verified.
- Do not disable the GitHub Pages workflow or move `neuk.bike` without verifying
  the Cloudflare deployment and preserving a rollback path.

## Verification

- Start with the narrowest relevant check for the changed code.
- Add or update focused tests for behavior changes in `src/lib/` and for logic that can be tested without a browser.
- Run `pnpm build` for changes that affect Next.js config, static export, routing, dynamic imports, or browser/server boundaries.
- Run `pnpm test:e2e` for Scotland data-loading, location, map, sharing, routing,
  or responsive UI changes when the browser environment is available.
- Treat local environment or dependency failures separately from code regressions and report them clearly.

## Dependencies

- Do not install, update, or replace dependencies unless the task requires it or the user asks for it.
- Keep Leaflet and browser API usage compatible with static export.

## Documentation

- Update `README.md` when commands, deployment behavior, dataset refresh behavior, or user-facing workflows change.
- Update `CONTRIBUTING.md` when contributor setup or verification expectations change.
