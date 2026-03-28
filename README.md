# Skill-Adapter

> **Evolve or Die (Adaptāre aut Morī)**

`Skill-Adapter` is an evolution management layer designed for **Claude Code** and **OpenClaw**. It handles skill localization, self-iteration, performance evaluation, security scanning, and skill sharing.

[中文文档](./README-ZH.md) | [User Guide](./docs/user-guide.md) | [API Docs](./docs/api.md) | [Registry Integration](./docs/registry.md)

---

## Philosophy

* **Context-Aware:** Eliminates the "information gap" between public Skills and private Workspaces.
* **Session-Driven:** Automatically captures user corrections and solidifies them as local Patches.
* **Evaluation-Based:** All improvements prove their value through quantifiable metrics.
* **Security-First:** Built-in security scanning for safe skill usage and sharing.
* **Share-Ready:** Export, import, and publish skills to registries easily.

---

## Quick Start

### Installation

```bash
npm install -g @yangjingo/skill-adapter
```

`npm install` will now auto-check GitHub CLI (`gh`) and try to install it by default, because `sa share` auto-PR needs `gh`.

- Disable auto install: `SA_AUTO_INSTALL_GH=0 npm install -g @yangjingo/skill-adapter`
- Manual install: `npm run setup:gh`
- Then authenticate: `gh auth login`
- Note: system package manager install may require admin/sudo permission.

### Initialize

```bash
# Initialize configuration
sa init

# Show current configuration
sa init --show
```

### Core Commands

```bash
# Discover hot skills
sa import

# Import a skill
sa import docker-env
sa import ~/.openclaw/skills/docker-env
sa import ./my-skill.zip

# View all available skills (OpenClaw, Claude Code, imported)
sa info

# View specific skill details
sa info docker-env

# View only Claude Code skills
sa info -p claudecode

# Run evolution analysis
sa evolve docker-env
sa evolve docker-env --apply

# View evolution metrics
sa summary docker-env

# Export skill
sa share docker-env -o docker-env.zip

# Create Pull Request
sa share docker-env --pr

# Export from platforms
sa export                    # Export all
sa export docker-env         # Export specific skill
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `sa init` | Initialize configuration |
| `sa import [source]` | Import or discover skills |
| `sa info [skill]` | View skill info (default: all platforms) |
| `sa evolve [skill]` | Run evolution analysis |
| `sa share [skill]` | Export or publish skill |
| `sa export [skill]` | Export from platforms |
| `sa scan [file]` | Security scan |
| `sa summary <skill>` | View evolution metrics |
| `sa config` | Manage preferences |

---

## Version Tags

Skill-Adapter automatically generates semantic version tags based on evolution metrics:

| Tag Format | Meaning |
|------------|---------|
| `v1.2.0-cost-15p` | Cost reduced by 15% |
| `v1.2.1-security-2` | Fixed 2 security issues |
| `v1.3.0-feature-xxx` | Added new feature xxx |
| `v2.0.0-breaking-1` | 1 breaking change |

---

## Configuration

### Environment Variables

```bash
export SKILL_ADAPTER_REPO="https://github.com/user/skills"
export SKILL_ADAPTER_REGISTRY="http://localhost:3000"
export SKILL_ADAPTER_PLATFORM="skills-sh"
```

### Config File

Config stored at `~/.skill-adapter.json`:

```json
{
  "skillsRepo": "https://github.com/user/skills",
  "registryUrl": "http://localhost:3000",
  "defaultPlatform": "skills-sh"
}
```

---

## Security Scanning

Skill-Adapter includes built-in security scanning to detect potentially malicious patterns in skills before execution or sharing. This feature is inspired by [skill-vetter](https://github.com/nickg/skill-vetter).

### Security Patterns Detected

| Category | Patterns |
|----------|----------|
| **Dangerous Commands** | `rm -rf`, `sudo rm`, `mkfs`, `dd if=` |
| **Network Operations** | `curl ... sh`, `wget ... | bash`, reverse shells |
| **Privilege Escalation** | `chmod 777`, `chown root`, `sudo su` |
| **Data Exfiltration** | `curl -F`, `wget --post-file`, base64 uploads |
| **Persistence** | cron jobs, startup scripts, service installation |

### Usage

```bash
# Scan a skill file
sa scan ./my-skill.md

# Scan with verbose output
sa scan ./my-skill.md --verbose

# Scan during import (automatic)
sa import ./suspicious-skill.md  # Will warn if issues found
```

### Integration with Evolution

Security scanning is automatically integrated into the evolution workflow:
- Skills with security issues get flagged before export
- Evolution suggestions include security improvements
- Version tags reflect security fixes (`v1.2.1-security-2`)

---

## Registry Integration

Skill-Adapter can work with any compliant registry. See [Registry Integration Guide](./docs/REGISTRY_INTEGRATION.md) for building your own registry.

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/skills` | GET | List/search skills |
| `/api/skills/:name` | GET | Get skill details |
| `/api/skills/:name/download` | GET | Download as ZIP |
| `/api/skills` | POST | Publish skill |
| `/api/leaderboard` | GET | Get hot skills |

---

## Project Structure

```
skill-adapter/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── index.ts            # Module exports
│   ├── core/
│   │   ├── security/       # Security evaluation
│   │   ├── sharing/        # Export/import and registry
│   │   ├── discovery/      # Skill discovery
│   │   ├── versioning/     # Semantic versioning
│   │   ├── config/         # Agent detection
│   │   ├── analyzer.ts     # Session analysis
│   │   ├── patcher.ts      # Skill injection
│   │   ├── workspace.ts    # Workspace rules
│   │   ├── evaluator.ts    # Evolution evaluation
│   │   ├── telemetry.ts    # Data collection
│   │   └── database.ts     # Evolution storage
│   └── types/              # TypeScript definitions
├── docs/
│   ├── USER_GUIDE.md
│   ├── API.md
│   └── REGISTRY_INTEGRATION.md
├── package.json
└── tsconfig.json
```

---

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run CLI
node dist/cli.js --help

# Test commands
node dist/cli.js info
node dist/cli.js import
node dist/cli.js evolve
```

---

## Documentation

- [User Guide](./docs/user-guide.md) - Complete usage instructions
- [API Documentation](./docs/api.md) - Programmatic API reference
- [Command Reference](./docs/commands/README.md) - CLI command documentation
- [Registry Integration](./docs/registry.md) - Build your own registry

---

## Acknowledgments

This project integrates and references the following open-source projects:

- **[skills.sh](https://skills.sh)** - Open skill ecosystem by Vercel Labs
  - This project uses the official `skills` CLI for skill discovery and installation
  - Some discovery API endpoints reference the skills.sh implementation
  - Install: `npm install skills` or `npx skills`

### Feature Comparison

| Feature | skill-adapter | skills CLI |
|---------|--------------|------------|
| Skill Discovery | ✅ `sa import` | ✅ `skills find` |
| Skill Installation | ✅ calls skills CLI | ✅ `skills add` |
| Security Scanning | ✅ `sa scan` | ❌ |
| Evolution Tracking | ✅ `sa evolve` | ❌ |
| Performance Metrics | ✅ `sa summary` | ❌ |

---

## License

MIT
