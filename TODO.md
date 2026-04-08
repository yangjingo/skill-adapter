# Skill-Adapter TODO

> Updated: 2026-03-28

## Progress Overview

```
Total Items: 14
Completed: 14 (100%)
Pending: 0
Broken: 0

Progress: ллллллллллллллллллллл 100% (Completed)
```

## Priority

```
P0 = Critical  (Core features, must work)
P1 = High      (Important features, affects UX)
P2 = Medium    (Nice-to-have features)
P3 = Low       (Optional, can be deferred)
```

## Tips

1. **Batch Testing**: Test all P0s in one session, then report all results
2. **Screenshot Errors**: Send screenshots of failures for faster debugging
3. **Date Every Change**: `✅ 2026-03-19` not just `✅`
4. **Clean Up**: Remove old deferred items after 2 weeks
5. **Session Review**: At session end, I'll ask you to confirm status before closing
6. **User-Focused**: Only track CLI commands (`sa `*). Remove internal modules
7. **Single Responsibility**: Only track progress and add user requests. Never fix bugs here
8. **Black-Box Testing**: Don't understand code/architecture. Only focus on user-facing interactions
9. **Traceability**: Test Command column shows CLI to reproduce. Run directly to verify
10. **Changelog Limit**: Keep last 5 entries. Archive old ones to `docs/CHANGELOG.md`

## Changelog

**2026-03-28**: Added CLI-to-core refactor backlog (`import`/`evolve`/`info`/`log`/`list`) for next phase.
**2026-04-08**: Marked `sa evolve` live Ink refresh and evidence-first filtering as "功能完成，待验证"; default agent loop set to 3 rounds.
**2026-04-08**: Added evidence-first evolve flow: keyword/grep/agent-loop session filtering before recommendation generation, with 3-round loop default.
**2026-04-08**: Clarified `sa evolve` docs: live Ink refresh is for terminal progress only; `--apply` remains the explicit write-back switch.
**2026-03-28**: TODO updated: added `sa scan --repair` / `sa scan --repair --apply` and `sa list` coverage entries.
**2026-03-28**: User completed `sa scan` CLI test flow; `sa scan` status updated to Completed and removed from Open Issues.
**2026-03-28**: `sa summary` refactor completed (logic moved into `src/core/summary.ts`), and user verified CLI output after rebuild.
**2026-03-28**: User completed evolve CLI test flow (`--help`, missing arg, unknown skill, tracked skill default/verbose/apply). `sa evolve` status updated to Completed.
**2026-03-28**: User confirmed CLI tests passed for `sa share --pr` and `sa share --fork-pr`; master table status updated to Completed.
**2026-03-28**: Docs/TODO aligned with new import behavior: remote `sa import` is recommendation-only; direct `skills` runtime dependency removed; added refs/thanks to skills.sh and [https://clawhub.ai/](https://clawhub.ai/)
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


| Priority | Feature              | Tested   | Date       | Test Command                                                       |
| -------- | -------------------- | -------- | ---------- | ------------------------------------------------------------------ |
| P0       | `sa init`            | yangjing | 2026-03-19 | `npx ts-node dist/cli.js init`                                     |
| P0       | `sa info`            | yangjing | 2026-03-19 | `npx ts-node dist/cli.js info modelscope-cli`                      |
| P1       | `sa summary`         | yangjing | 2026-03-28 | `node dist/cli.js summary qa-only`                                 |
| P1       | `sa export`          | yangjing | 2026-03-19 | `npx ts-node dist/cli.js export modelscope-cli`                    |
| P1       | `sa share`           | yangjing | 2026-03-19 | `npx ts-node dist/cli.js share modelscope-cli`                     |
| P2       | `sa log`             | yangjing | 2026-03-19 | `npx ts-node dist/cli.js log`                                      |
| P2       | `sa config`          | yangjing | 2026-03-19 | `npx ts-node dist/cli.js config`                                   |
| P0       | `sa import`          | yangjing | 2026-03-27 | `npx ts-node src/cli.ts import qa-only`                            |
| P0       | `sa evolve`          | yangjing | 2026-03-28 | `node dist/cli.js evolve qa-only [--verbose|--apply]`              |
| P1       | `sa scan`            | yangjing | 2026-03-28 | `node dist/cli.js scan <skill-or-file>`                            |
| P1       | `sa scan --repair`   | yangjing | 2026-03-28 | `node dist/cli.js scan <skill-or-file> --repair`                   |
| P1       | `sa scan --apply`    | yangjing | 2026-03-28 | `node dist/cli.js scan <skill-or-file> --repair --apply`           |
| P1       | `sa share --pr`      | yangjing | 2026-03-28 | `node dist/cli.js share <skill> --repo <upstream> --yes`           |
| P1       | `sa share --fork-pr` | yangjing | 2026-03-28 | `node dist/cli.js share <skill> --repo <upstream> --fork-pr --yes` |
| P2       | `sa list`            | yangjing | 2026-03-28 | `node dist/cli.js list`                                             |

## Open Issues

| Priority | Feature | Status | Notes | Test Command |
| -------- | ------- | ------ | ----- | ------------ |

## Refactor Backlog

| Priority | Task | Status | Scope | Target |
| -------- | ---- | ------ | ----- | ------ |
| P1 | `sa import` command handler extraction | 🔄 Pending | Move source resolution/import flow from `src/cli.ts` to `src/core/import/*` | Reduce CLI business logic |
| P1 | `sa evolve` command handler extraction | 🔄 Pending | Move evolve pipeline/apply/record flow to `src/core/evolution/*` command service | Keep CLI as orchestration |
| P2 | `sa info` + `sa list` unification | 🔄 Pending | Reuse shared listing/detail service in `src/core/discovery/*` | Remove duplicated directory scan logic |
| P2 | `sa log` summary service extraction | 🔄 Pending | Move telemetry/patch rendering to `src/core/log/*` | Standardize output + testability |
| P1 | `sa evolve` live Ink refresh | 功能完成，待验证 | Replace spinner-heavy output with live progress, streaming status, and preview panels | Keep `--apply` as explicit side-effect flag |
| P1 | `sa evolve` evidence-first filtering | 功能完成，待验证 | Filter sessions by keyword / bash grep / rg / agent-loop signals before model calls | Improve signal-to-noise for recommendations |
| P3 | `sa config` action handler extraction | 🔄 Pending | Move get/set/reset validation to `src/core/config/*` | Thin CLI action layer |




