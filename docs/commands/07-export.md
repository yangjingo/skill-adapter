# sa export - Export Local Skill Package

## Overview

`sa export` exports **local imported skills** to a package file.

- Input direction: local -> file
- Typical usage: backup, delivery, manual upload

## Command

```bash
sa export [skillName] [options]
```

## Options

| Option | Description | Default |
|---|---|---|
| `-o, --output <path>` | Export output file path | `./<skill>-v<version>.zip` |
| `-f, --format <format>` | `json` / `yaml` / `zip` | `zip` |
| `--zip` | Shorthand for `-f zip` | `false` |
| `--yes` | Skip security confirmation | `false` |

## Examples

```bash
sa export qa-only
sa export qa-only --zip
sa export qa-only -f yaml
sa export qa-only -o ./backup/qa-only.zip
```

## Notes

- Runs security scan before export.
- If risk exists, use `--yes` to force export.
- To publish by PR, use `sa share <skill>`.
