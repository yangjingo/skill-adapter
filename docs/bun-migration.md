# Bun Migration Notes

This repository now prefers Bun for day-to-day commands while keeping Node-compatible fallbacks in `package.json` scripts.

## Command mapping

- Install dependencies: `bun install`
- Global install: `bun add -g @yangjingo/skill-adapter`
- Development run: `bun run dev`
- Build: `bun run build`
- Start the CLI: `bun run start`
- Test suite: `bun run test`
- GitHub CLI bootstrap: `bun run setup:gh`

## Lockfile strategy

- `bun.lock` is the preferred lockfile for Bun-based installs.
- `package-lock.json` stays in the repo for transitional compatibility with npm-based workflows and other agents that may still rely on it.
- When dependencies change, run `bun install` and commit the updated Bun lockfile alongside package updates.

## Notes

- The package scripts prefer Bun first, then fall back to `node` or `ts-node` if Bun is not available.
- Existing CLI usage through `sa` is unchanged.