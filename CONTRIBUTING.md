# Contributing to edinburgh-cycle-parking

Thanks for contributing.

## Setup

Requirements:

- Node.js 20+
- `pnpm` 10+

Clone the repo and install dependencies:

```bash
git clone https://github.com/tom-auger/edinburgh-cycle-parking.git
cd edinburgh-cycle-parking
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
```

## Workflow

1. Make changes under `src/` and add or update focused tests near the changed code.
2. Run the narrowest relevant test first, then `pnpm run test`.
3. Run `pnpm run lint`, `pnpm run format`, and `pnpm run build` before opening a PR.
4. Update `README.md` when user-facing commands, installation, or workflows change.

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

Open an issue at [https://github.com/tom-auger/edinburgh-cycle-parking/issues](https://github.com/tom-auger/edinburgh-cycle-parking/issues).
