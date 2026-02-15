# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-02-15

### Added

- Interactive TUI for managing GitHub branch protection rules
- Organization and repository selection with multi-select support
- Branch protection editor with all GitHub settings:
  - Required PR reviews (approval count, stale review dismissal, code owners)
  - Required status checks (auto-discovers CI job names)
  - Admin enforcement toggle
  - Linear history requirement
  - Force push and deletion controls
  - Conversation resolution requirement
- Template system for saving/loading protection configurations
- Default templates: basic, strict, unprotected
- Bulk apply to multiple repositories/branches
- Local mode (`--local`) to auto-detect current repository
- Preview changes before applying
- Apply logging to `~/.config/repoprotector/apply.log`

### Technical

- Built with Bun + TypeScript
- Uses `@opentui/core` for terminal UI
- GitHub API via `gh` CLI
- CI/CD with GitHub Actions
- 22 unit tests

[0.1.0]: https://github.com/OpenStaticFish/repoprotector/releases/tag/v0.1.0
