# sa evolve - Evolution Analysis

## Overview

`sa evolve` is the core command of Skill-Adapter, used for:
- Loading and analyzing tracked skills
- Analyzing skill compatibility with current work environment
- Extracting session evidence with keyword, grep, and agent-loop signals
- Running a multi-round evidence loop to rescore and refine high-signal sessions
- Generating optimization recommendations
- Showing live progress in terminals that support Ink
- Applying high-confidence recommendations when `--apply` is set
- Tracking evolution history

---

## Command Format

```bash
sa evolve <skillName> [options]
```

## Parameters

| Parameter | Description |
|-----------|-------------|
| `skillName` | Required. Skill name to analyze |

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--apply` | Apply high-confidence recommendations to skill file | false |
| `-v, --verbose` | Show detailed technical analysis and recommendation details | false |

---

## Output Modes

### Default (Concise)
- Short summary only
- Recommendation count by priority
- Clear next-step commands
- Live progress indicators when the terminal supports Ink

### Verbose (`--verbose`)
- Full analysis details (static/content/context)
- Session evidence summary: keyword hits, grep hits, loop signals, and high-signal highlights
- Streaming thinking output (when AI model is available)
- Full recommendation cards with suggested content preview
- Live status updates during long-running analysis

---

## Usage Examples

### 1. Analyze a skill (default concise mode)

```bash
sa evolve docker-env
```

**Output style:** concise summary + next steps.

### 2. Analyze with full details

```bash
sa evolve docker-env --verbose
```

**Output style:** full technical breakdown and recommendation details.

### 3. Analyze and apply recommendations

```bash
sa evolve docker-env --apply
```

Applies recommendations with confidence >= 0.8 and records evolution history.

### 4. Analyze, detailed output, then apply

```bash
sa evolve docker-env --verbose --apply
```

---

## Expected Flow

1. Validate CLI input (`skillName` is required; missing argument shows help)
2. Load tracked skill from local evolution database
3. Show SA configuration and connection status
4. Analyze skill content and workspace context
5. Build session evidence from Claude Code and OpenClaw sessions
6. Run a multi-round evidence loop to score, expand, and rescore high-value sessions
7. Generate recommendations from the reduced evidence set (AI-first, rule-based fallback)
8. Show concise summary (or detailed output with `--verbose`)
9. If `--apply` is set, apply high-confidence recommendations and save history
10. If the terminal supports it, keep the progress UI in sync via Ink instead of repainting with plain logs

## CLI Validation

- `sa evolve` now requires `skillName`
- Running `sa evolve` without arguments prints:
  - error: missing required argument `skillName`
  - command help for `sa evolve`
- If the skill is not tracked locally, command suggests:
  - `sa import <skill>`
  - `sa info`

---

## Next Steps

After evolution analysis:
- `sa log <skill>`: view evolution history
- `sa summary <skill>`: view metrics summary
- `sa export <skill>`: export local skill package
- `sa scan <skill>`: run security scan
