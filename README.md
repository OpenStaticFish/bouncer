# RepoProtector

[![npm version](https://img.shields.io/npm/v/repoprotector.svg)](https://www.npmjs.com/package/repoprotector)
[![CI](https://github.com/OpenStaticFish/repoprotector/actions/workflows/ci.yml/badge.svg)](https://github.com/OpenStaticFish/repoprotector/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A terminal UI for managing GitHub branch protection rules across multiple repositories.

![RepoProtector Screenshot](./docs/screenshot.png)

## Features

- **Interactive TUI** - Navigate organizations, repos, and branches with keyboard
- **Visual Editor** - Toggle protection settings with live preview
- **Templates** - Save and reuse protection configurations
- **Bulk Apply** - Apply the same rules to multiple repos/branches at once
- **CI Integration** - Auto-discovers CI job names for required status checks
- **Local Detection** - `--local` mode detects current git repo automatically

## Requirements

- [Bun](https://bun.sh) >= 1.0
- [GitHub CLI (`gh`)](https://cli.github.com/) authenticated with repo access

## Installation

```bash
# Install globally with bun
bun install -g repoprotector

# Or run directly
bunx repoprotector
```

## Quick Start

```bash
# Launch the TUI
repoprotector

# Skip org selection, use current repo
repoprotector --local
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate |
| `Enter` | Select / Toggle |
| `Space` | Toggle selection (multi-select) |
| `Tab` | Next field |
| `Ctrl+A` | Apply protection |
| `Esc` | Back / Cancel |
| `t` | Templates screen |
| `s` | Save as template |

## Workflow

1. **Select Organization** - Choose from your GitHub orgs or personal account
2. **Select Repositories** - Pick one or more repos to protect
3. **Select Branch** - Choose the branch to protect (e.g., `main`, `master`)
4. **Edit Protection** - Configure settings in the visual editor
5. **Preview & Apply** - Review changes and apply

## Configuration

Templates and logs are stored in:

```
~/.config/repoprotector/
├── templates/        # Saved protection templates
│   ├── basic.json
│   ├── strict.json
│   └── ...
└── apply.log         # History of applied protections
```

### Default Templates

| Template | Description |
|----------|-------------|
| `basic` | Requires 1 PR approval, conversation resolution |
| `strict` | 2 approvals, code owners, admin enforcement |
| `unprotected` | No PR required, allows force pushes |

## Screenshots

<!-- Add your screenshots here -->

### Organization Selector
![Org Selector](./docs/org-selector.png)

### Branch Protection Editor
![Editor](./docs/editor.png)

### Template Manager
![Templates](./docs/templates.png)

## Development

```bash
# Clone the repo
git clone https://github.com/OpenStaticFish/repoprotector.git
cd repoprotector

# Install dependencies
bun install

# Run locally
bun run index.ts --local

# Run tests
bun test

# Type check
bun run typecheck

# Lint
bunx biome check .
```

## API Reference

The GitHub API interactions are handled via the `gh` CLI. Ensure you're authenticated:

```bash
gh auth login
gh auth status
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[MIT](LICENSE) © OpenStaticFish
