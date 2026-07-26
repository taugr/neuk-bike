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
pnpm run update:network
pnpm run verify:network
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
the Geofabrik Scotland, Wales, Ireland-and-Northern-Ireland, and Canary Islands
PBFs, the Armenia PBF, 47 England county PBFs, 18 Spain regional PBFs, and seven
coverage polygons. The cached inputs currently require about 4 GB. Inputs are
processed sequentially to keep contextual naming memory bounded. The command
replaces the generated council snapshot, quality report, schema-v2 manifest,
content-addressed chunks, and point index.

Do not hand-edit files under `public/data/parking/` or generated JSON under
`src/data/`. Change the normalizer or merge rules in `scripts/`, add focused
tests, rerun the refresh, and review record counts, completeness, discarded
features, per-input source timestamps and checksums, cross-region and council
duplicate matches, naming-tier counts and samples, peak memory, asset budgets,
and representative UK, Ireland, mainland Spain, Balearic, Canary, Yerevan, and
Gyumri locations before committing. Also review Armenian-script names and the
region-aware directions state.

## National Cycle Network data

`pnpm update:network` refreshes the official Walk Wheel Cycle Trust source and
atomically rewrites `public/data/cycle-network/` plus
`src/data/cycle-network-report.json`. Do not hand-edit those outputs. Review the
source timestamps and checksum, classifications, record and vertex counts,
coverage, chunk duplication, largest asset, and maximum compressed buffered
payload, then run `pnpm verify:network` before committing a refreshed snapshot.

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
