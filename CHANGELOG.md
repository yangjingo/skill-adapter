# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-03-28

### Changed
- `sa import` remote flow no longer depends on the `skills` package runtime.
- Remote input now enters recommendation-only mode (search + trending + manual install hint).
- Refactored `sa summary` logic into `src/core/summary.ts` to keep CLI handlers thinner and improve reuse.
- Added community guidance links in CLI output:
  - https://github.com/leow3lab/ascend-skills
  - https://github.com/leow3lab/awesome-ascend-skills

### Docs
- Updated docs/TODO to clarify that this version removed direct skills dependency and keeps recommendation behavior.
- Added/updated references and acknowledgments for:
  - https://skills.sh
  - https://clawhub.ai/

## [0.1.2] - 2026-03-26

### Added
- Added `files` field in `package.json` to include `dist/` directory in npm package
- CI workflow for automated testing and publishing

### Changed
- Package renamed from `skill-adapter` to `@yangjingo/skill-adapter`
- Updated README installation instructions with scoped package name
- CI now triggers on tag push instead of manual release

### Fixed
- Fixed npm package missing build artifacts (`dist/` directory)

## [0.1.0] - 2026-03-26

### Added
- Initial release of Skill-Adapter
- Core features:
  - Skill discovery and import (`sa import`)
  - Skill information display (`sa info`)
  - Evolution analysis (`sa evolve`)
  - Performance metrics (`sa summary`)
  - Security scanning (`sa scan`)
  - Skill export and sharing (`sa share`, `sa export`)
- Support for Claude Code and OpenClaw platforms
- Built-in security scanning for malicious patterns
- Registry integration for skill sharing
- Semantic versioning based on evolution metrics
