---
name: manual-test
description: Use when manually testing Neuk Bike from the production static export, especially when the app should be served on 0.0.0.0 and verified to be serving the latest built working tree.
---

# Manual Test

Use this skill when the user asks to start or refresh the local production app for manual testing.

## Workflow

Run the bundled script from the repo root:

```sh
.agents/skills/manual-test/scripts/serve-static-export.sh
```

The script:

1. Runs `pnpm build` to regenerate the static export in `out/`.
2. Starts a static server bound to `0.0.0.0` on port `4181` if one is not already listening.
3. Requests `http://127.0.0.1:4181/` and checks the served `Last-Modified` header is at least as new as the build start time.
4. Prints the local URL and the mock GPS URL for manual testing.
5. Keeps a newly started server running in the foreground. Leave that command session active while the user tests.

If port `4181` is already serving `out/`, keep it running; the rebuilt files are picked up from disk. If another process owns the port and the freshness check fails, stop that process or rerun with another port:

```sh
MANUAL_TEST_PORT=4182 .agents/skills/manual-test/scripts/serve-static-export.sh
```

## Notes

- Keep this workflow production-like; use the static export, not `pnpm dev`.
- Use `0.0.0.0` for the server bind so the app can be tested from other devices on the local network or tailnet.
- For GPS testing, prefer:

```text
http://127.0.0.1:4181/?mockGps=55.9533,-3.1883
```
