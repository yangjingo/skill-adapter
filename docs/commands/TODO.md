# Skill-Adapter Test Documentation

> Last updated: 2026-03-27

---

## ✅ Completed Tasks

- [x] Convert all Chinese hints to English in test documentation files
- [x] Remove redundant documentation (quick-reference.md, 06-log.md)
- [x] Sync `sa import` docs with simplified behavior and local Claude Code skill-name import

---

## Test Documentation Files

| File | Command | Description |
|------|---------|-------------|
| [01-init.md](./01-init.md) | `sa init` | Initialize configuration |
| [02-import.md](./02-import.md) | `sa import` | Import/discover skills |
| [03-info.md](./03-info.md) | `sa info` | View skill information |
| [04-evolve.md](./04-evolve.md) | `sa evolve` | Evolution analysis |
| [05-scan.md](./05-scan.md) | `sa scan` | Security scan |
| [07-export.md](./07-export.md) | `sa export` | Export skills |
| [08-share.md](./08-share.md) | `sa share` | Share skills |
| [09-config.md](./09-config.md) | `sa config` | Configuration management |
| [10-summary.md](./10-summary.md) | `sa summary` | Evolution metrics comparison |

---

## Test Scenarios

See [scenarios.md](./scenarios.md) for comprehensive test scenarios representing real user workflows.

---

## 📌 Next Steps

Run the CLI commands to verify the documentation matches actual behavior:

```bash
sa init --show           # View current config
sa info                  # List all skills
sa import                # Discover hot skills
sa evolve <skill-name>   # Analyze a skill
sa scan <skill-name>     # Security scan
sa summary <skill-name>  # View evolution metrics
```
