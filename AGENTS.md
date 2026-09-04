# AGENTS.md

## Codex workflow

This project's `.codex/config.toml` selects GPT-6 Astra (`gpt-6-astra`) with medium reasoning. Explicit user model choices take precedence. This configures Codex development work; application model selections remain separate.

- Complete authorized work through implementation and relevant verification. Use existing project patterns for routine, reversible decisions; ask when missing information materially changes scope or outcome.
- Preserve unrelated working-tree changes and existing application behavior. Follow explicit boundaries on planning, commits, pushes, releases, and deployment.
- Prepare a concrete, reviewable result before requesting any additional authorization that is actually needed. Continue independent authorized work while awaiting clarification.
- Follow explicit user instructions over skill guidelines, subject to system and developer requirements. If a skill blocks progress, link to the exact instruction and explain why it applies.
- Keep progress updates and final reports concise: explain what changed, what was verified, and any remaining blocker.
- Run checks proportional to the change and complete required project gates. Instruction-only changes need a diff, Markdown formatting, and configuration validation; behavior changes need relevant tests. Do not repeat successful checks without new evidence.
- Use subagents when requested by the user or required by applicable instructions. Give each a bounded responsibility and preserve other agents' changes.
- Use `pnpm` and check `package.json` for current scripts. Keep generated files and local artifacts out of the commit unless explicitly requested.

## Project Shape

- This is a static, backend-free Next.js app for finding cycle parking across
  the UK, Ireland, Spain, and Armenia.
- The generated release combines City of Edinburgh Council data with
  OpenStreetMap coverage from Geofabrik extracts for Scotland, Wales, Ireland
  and Northern Ireland, Armenia, plus sequential England county and Spain
  regional extracts.
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
  cached regional PBFs, normalizes and merges all sources, derives contextual
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
- Cloudflare Pages is the production host and serves the generated
  `out/` directory as static assets. `public/_headers` defines its caching and
  security policy.
- Successful pushes to `main` deploy through the GitHub Actions quality gate to
  the existing Direct Upload project. `pnpm deploy:cloudflare` is the manual
  fallback.
- `neuk.bike` is attached to the `neuk-bike` Pages project; the provider URL is
  `neuk-bike.pages.dev`.
- GitHub Pages is retired. Use Cloudflare Pages deployment history and the
  provider URL as the rollback path, and verify both URLs after deployment.

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
