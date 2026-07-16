# Contributing to neuk-bike

Thanks for contributing.

## Setup

Requirements:

- Node.js 20+
- `pnpm` 11+

Clone the repo and install dependencies:

```bash
git clone https://github.com/taugr/neuk-bike.git
cd neuk-bike
pnpm install
```

This repo is a static Next.js app. Inspect `src/`, `scripts/`, and `README.md` before changing public behavior.

## Common Commands

```bash
pnpm run test
pnpm run lint
pnpm run format
pnpm run build
```

Useful variants:

```bash
pnpm run lint:fix
pnpm run format:fix
pnpm run test:watch
pnpm run test:e2e
pnpm run update:data
pnpm run deploy:cloudflare
```

Successful pushes to `main` deploy automatically to the existing Cloudflare
Pages project after the quality job passes. `pnpm run deploy:cloudflare` is the
manual fallback and requires an authenticated Wrangler session.

## Workflow

1. Make changes under `src/` and add or update focused tests near the changed code.
2. Run the narrowest relevant test first, then `pnpm run test`.
3. Run `pnpm run lint`, `pnpm run format`, and `pnpm run build` before opening a PR.
4. Update `README.md` when user-facing commands, installation, or workflows change.

## Parking data

`pnpm update:data` downloads the current council feed and downloads or reuses
the Geofabrik Scotland, Wales, and Ireland-and-Northern-Ireland PBFs, 47 England
county PBFs, and four coverage polygons. The cached inputs currently require
about 2.4 GB. Inputs are processed
sequentially to keep contextual naming memory bounded. The command replaces the
generated council snapshot, quality report, schema-v2 manifest,
content-addressed chunks, and point index.

Do not hand-edit files under `public/data/parking/` or generated JSON under
`src/data/`. Change the normalizer or merge rules in `scripts/`, add focused
tests, rerun the refresh, and review record counts, completeness, discarded
features, per-input source timestamps and checksums, cross-region and council
duplicate matches, naming-tier counts and samples, peak memory, asset budgets,
and representative UK and Ireland locations before committing.

## Testing

Tests live next to the app code under `src/`.

Run the full suite:

```bash
pnpm run test
```

## Pull Requests

- Keep changes focused.
- Add tests for behavior changes.
- Prefer updating documentation in the same PR when user-facing behavior changes.

## Questions

Open an issue at [https://github.com/taugr/neuk-bike/issues](https://github.com/taugr/neuk-bike/issues).
