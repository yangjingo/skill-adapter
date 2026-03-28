# Skill-Adapter TODO

> Updated: 2026-03-27

## Progress Overview

```
Total Items: 11
Completed: 9 (82%)
Pending: 0
Broken: 2

Progress: █████████████████░░░ 82% (Completed)
```

## Priority

```
P0 = Critical  (Core features, must work)
P1 = High      (Important features, affects UX)
P2 = Medium    (Nice-to-have features)
P3 = Low       (Optional, can be deferred)
```

##  Tips

1. **Batch Testing**: Test all P0s in one session, then report all results
2. **Screenshot Errors**: Send screenshots of failures for faster debugging
3. **Date Every Change**: `✅ 2026-03-19` not just `✅`
4. **Clean Up**: Remove old deferred items after 2 weeks
5. **Session Review**: At session end, I'll ask you to confirm status before closing
6. **User-Focused**: Only track CLI commands (`sa *`). Remove internal modules
7. **Single Responsibility**: Only track progress and add user requests. Never fix bugs here
8. **Black-Box Testing**: Don't understand code/architecture. Only focus on user-facing interactions
9. **Traceability**: Test Command column shows CLI to reproduce. Run directly to verify
10. **Changelog Limit**: Keep last 5 entries. Archive old ones to `docs/CHANGELOG.md`


## Changelog

**2026-03-27**: `sa import` simplified flow verified (discover/recommend/local import) + local Claude Code skill name import fixed
**2026-03-28**: `sa share --pr / --fork-pr` completed + docs/test flow finalized
**2026-03-27**: Task added: `sa share -pr <skill-name>` create PR to `leow3lab/awesome-ascend-skills`
**2026-03-19**: Bug: `sa import` fails on skills.sh, skill-cli & chrome-cli
**2026-03-19**: Tested `sa init`, `sa config` ✅
**2026-03-19**: Bug reported in `sa evolve` recommend module
**2026-03-19**: Fixed `sa init` - now shows AI model config + guidance

## Status

`✅` Completed | `🔄` Pending | `⬜` Not started | `❌` Broken | `🚫` Deferred

## Completed Table

| Priority | Feature      | Tested   | Date       | Test Command                                      |
| -------- | ------------ | -------- | ---------- | ------------------------------------------------- |
| P0       | `sa init`    | yangjing | 2026-03-19 | `npx ts-node dist/cli.js init`                    |
| P0       | `sa info`    | yangjing | 2026-03-19 | `npx ts-node dist/cli.js info modelscope-cli`     |
| P1       | `sa summary` | yangjing | 2026-03-19 | `npx ts-node dist/cli.js summary modelscope-cli`  |
| P1       | `sa export`  | yangjing | 2026-03-19 | `npx ts-node dist/cli.js export modelscope-cli`   |
| P1       | `sa share`   | yangjing | 2026-03-19 | `npx ts-node dist/cli.js share modelscope-cli`    |
| P2       | `sa log`     | yangjing | 2026-03-19 | `npx ts-node dist/cli.js log`                     |
| P2       | `sa config`  | yangjing | 2026-03-19 | `npx ts-node dist/cli.js config`                  |
| P0       | `sa import`  | yangjing | 2026-03-27 | `npx ts-node src/cli.ts import qa-only`           |

## Master Table

| Priority | Feature      | Status | Tested | Notes                   | Test Command                                      |
| -------- | ------------ | ------ | ------ | ----------------------- | ------------------------------------------------- |
| P0       | `sa import`  | ✅     | yangjing | Simplified to discover/recommend + local import only; local Claude Code skill name import verified | `npx ts-node src/cli.ts import qa-only` |
| P0       | `sa evolve`  | ❌     |        | Bug in recommend module | `npx ts-node dist/cli.js evolve <skill>`          |
| P1       | `sa scan`    | ❌     |        | Streaming output broken | `npx ts-node dist/cli.js scan <skill>`            |
| P1       | `sa share --pr / --fork-pr` | ✅ | yangjing | PR flow completed for owner and non-owner(fork-pr), with guidance/docs/tests updated | `node dist/cli.js share <skill> --repo <upstream> [--fork-pr] --yes` |
