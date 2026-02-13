# RepoProtector - Agent Guidelines

## Project Overview

RepoProtector is a TUI (Terminal User Interface) application for managing GitHub branch protection rules. It uses `@opentui/core` for rendering terminal UI components and the GitHub CLI (`gh`) for API interactions.

## Build/Package Commands

```bash
# Install dependencies
bun install

# Run the application
bun run index.ts

# Run with local repository detection (skips org selector)
bun run index.ts --local
# or
bun run start:local

# Type checking
bun run typecheck
# or
bunx tsc --noEmit

# Run tests
bun run test
# or
bun test

# Run a single test file
bun test src/utils/templates.test.ts

# Lint and format check
bunx biome check .

# Auto-fix lint/format issues
bunx biome check --write .
```

## Runtime & Environment

- **Runtime**: Bun (NOT Node.js)
- **Language**: TypeScript with strict mode enabled
- **Module System**: ES Modules (`"type": "module"`)

### Bun-Specific Patterns

- Use `bun <file>` instead of `node` or `ts-node`
- Use `Bun.spawn()` for subprocess execution (not `child_process`)
- Use `Bun.write()` for file writes (not `fs.writeFile`)
- Use `bun test` for testing (not jest/vitest)
- Bun auto-loads `.env` files - don't use dotenv package

## Code Style Guidelines

### Imports

```typescript
// Type-only imports use 'type' keyword
import type { Organization, Repository } from './types'

// Regular imports
import { createCliRenderer, BoxRenderable } from '@opentui/core'

// Group imports: external packages first, then internal modules
import { homedir } from 'os'
import { join } from 'path'
import { mkdir, readdir } from 'fs/promises'
import type { Template } from '../types'
import { theme } from '../theme'
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Variables | camelCase | `selectedRepos`, `focusIndex` |
| Functions | camelCase | `getOrganizations()`, `showRepoSelector()` |
| Types/Interfaces | PascalCase | `BranchProtection`, `AppState` |
| Constants | camelCase | `CONFIG_DIR`, `TEMPLATES_DIR` |
| Component factories | camelCase with 'create' prefix | `createOrgSelector()` |
| File names | PascalCase for components | `ProtectionEditor.ts` |
| Utility files | camelCase | `templates.ts` |

### TypeScript Patterns

```typescript
// Explicit return types on exported functions
export async function getOrganizations(): Promise<Organization[]> {
  // ...
}

// Use 'const' with type annotation for state objects
const state: {
  screen: Screen
  org: Organization | null
  repos: Repository[]
} = {
  screen: 'orgs',
  org: null,
  repos: [],
}

// Interface for callback types
export type OrgSelectedCallback = (org: Organization) => void

// Union types for finite states
type Screen = 'orgs' | 'repos' | 'branches' | 'editor' | 'templates' | 'preview'

// Extended types for components with methods
export type ProtectionEditorWithMethods = BoxRenderable & {
  setProtection: (protection: BranchProtectionInput | null) => void
  handleKey: (key: { name: string; shift: boolean; ctrl: boolean }) => void
}
```

### Component Factory Pattern

Components are created using factory functions that return the container with attached methods:

```typescript
export function createOrgSelector(
  renderer: CliRenderer,
  onSelect: OrgSelectedCallback
): OrgSelectorResult {
  const container = new BoxRenderable(renderer, {
    id: 'org-selector',
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    backgroundColor: theme.panelBg,
    padding: 1,
  })
  
  // Build UI hierarchy
  container.add(title)
  container.add(select)
  
  return { container, select }
}

// Return extended type with methods using Object.assign
return Object.assign(container, { setProtection, handleKey })
```

### Error Handling

```typescript
// Standard pattern: try/catch with instanceof check
try {
  const repos = await getOrgRepos(state.org.login)
  hideLoading()
} catch (err) {
  hideLoading()
  showError(err instanceof Error ? err.message : 'Failed to load repositories')
}

// For expected failures, catch and return null/false
try {
  const content = await readFile(path, 'utf-8')
  return JSON.parse(content)
} catch {
  return null
}

// Subprocess error handling
const exitCode = await proc.exited
if (exitCode !== 0) {
  throw new Error(stderr || `Command failed with exit code ${exitCode}`)
}
```

### Async Patterns

```typescript
// Fire-and-forget async (catch errors to prevent unhandled rejections)
Bun.write(logPath, entry).catch(() => {})

// Sequential async operations in loops
for (const target of targets) {
  try {
    await updateBranchProtection(target.owner, target.repo, target.branch, protection)
  } catch (error) {
    // Handle individual failures
  }
}
```

### Subprocess Execution (Bun.spawn)

```typescript
const proc = Bun.spawn(['gh', 'api', endpoint], {
  stdout: 'pipe',
  stderr: 'pipe',
  stdin: body ? 'pipe' : undefined,
})

const stdout = await new Response(proc.stdout as ReadableStream).text()
const stderr = await new Response(proc.stderr as ReadableStream).text()
const exitCode = await proc.exited
```

## Project Structure

```
src/
├── app.ts              # Main application logic, screen management
├── types.ts            # TypeScript interfaces and types
├── theme.ts            # Color scheme and keybindings
├── api/
│   └── github.ts       # GitHub API interactions via gh CLI
├── components/
│   ├── OrgSelector.ts
│   ├── RepoSelector.ts
│   ├── BranchSelector.ts
│   ├── ProtectionEditor.ts
│   ├── TemplateManager.ts
│   └── PreviewPane.ts
└── utils/
    └── templates.ts    # Template persistence to ~/.config/repoprotector/
```

## Configuration

- Config directory: `~/.config/repoprotector/`
- Templates stored as JSON in `~/.config/repoprotector/templates/`
- Application logs written to `~/.config/repoprotector/apply.log`

## Testing

When adding tests, follow this pattern:

```typescript
import { test, expect, describe } from "bun:test"

describe("module name", () => {
  test("should do something", () => {
    expect(result).toBe(expected)
  })
})
```

## Notes

- No code comments unless explaining complex logic (code should be self-documenting)
- Use non-null assertion (`!`) only after explicit null checks
- Prefer early returns to reduce nesting
- Keep functions focused - split if exceeding ~50 lines
