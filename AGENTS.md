# AGENTS.md

## Project Shape

- This is a static, backend-free Next.js app for finding City of Edinburgh Council cycle parking.
- Runtime data is bundled from `src/data/cycle-parking.json`; there is no database or server API.
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
- The data refresh script downloads public ArcGIS GeoJSON, normalizes it, and rewrites `src/data/cycle-parking.json`.
- Treat `src/data/cycle-parking.json` as generated data. Do not hand-edit records unless the user explicitly asks for a local data correction.
- When changing the normalizer in `scripts/update-cycle-parking-data.mjs`, check the generated metadata and record shape before committing the output.
- Preserve source attribution and Open Government Licence details in README-facing documentation.

## Frontend Guidance

- Keep the app mobile-friendly and map-first. Avoid landing-page or marketing-style layouts.
- Browser-only APIs such as geolocation, `window.location`, and Leaflet must stay behind client-side boundaries.
- `react-leaflet` map code should remain dynamically loaded or otherwise isolated from server rendering.
- Keep user-facing copy short, concrete, and non-technical.
- When touching location, search, map, or responsive UI behavior, verify in a browser when practical.

## Deployment

- The app uses static export via `next.config.ts`.
- GitHub Pages deployment sets `GITHUB_PAGES=true`, which enables the `/edinburgh-cycle-parking` base path and asset prefix.
- Do not remove or bypass the GitHub Pages base-path behavior without verifying local static export and the intended deployment target.

## Verification

- Start with the narrowest relevant check for the changed code.
- Add or update focused tests for behavior changes in `src/lib/` and for logic that can be tested without a browser.
- Run `pnpm build` for changes that affect Next.js config, static export, routing, dynamic imports, or browser/server boundaries.
- Treat local environment or dependency failures separately from code regressions and report them clearly.

## Dependencies

- Do not install, update, or replace dependencies unless the task requires it or the user asks for it.
- Keep Leaflet and browser API usage compatible with static export.

## Documentation

- Update `README.md` when commands, deployment behavior, dataset refresh behavior, or user-facing workflows change.
- Update `CONTRIBUTING.md` when contributor setup or verification expectations change.
