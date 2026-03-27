# sa import - Import/Discover Skills

## Overview

`sa import` now has a simplified behavior:

- No source: discover hot skills from `skills.sh`
- Local source (file/folder/OpenClaw/Claude Code local skill): import into local database
- Non-local source: search and recommend only (no remote download)

---

## Command

```bash
sa import [source] [options]
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-n, --name <name>` | Rename skill when importing local content | - |
| `--no-scan` | Skip security scan | enabled |
| `-l, --limit <number>` | Number of results in discovery mode | 10 |

---

## Behavior

### 1. Discover mode (no source)

```bash
sa import
```

Shows hot skills from `skills.sh`.

### 2. Local import mode

```bash
sa import ./my-skill
sa import ./my-skill.zip
sa import ~/.openclaw/skills/my-skill
sa import qa-only
```

Imports local skill content and tracks it for `sa info`, `sa evolve`, `sa log`.

Notes:
- `sa import <skill-name>` now checks local Claude Code skills first (`~/.claude/skills/<skill-name>`).
- A local folder that contains only `skill.md` (without `skill.json`) is supported.

### 3. Remote recommendation mode

```bash
sa import find-skills
sa import https://skills.sh/cloudflare/vinext/migrate-to-vinext
```

Shows:

- Search link: `https://skills.sh/?q=<query>`
- Recommended matches
- Trending skills

No automatic download is performed.

---

## Manual install tip

If you decide to install a remote skill, use the official CLI manually:

```bash
npx skills add <github-repo> --skill <skill-name>
```
