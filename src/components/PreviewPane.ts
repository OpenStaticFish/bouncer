import { BoxRenderable, type CliRenderer, TextRenderable } from '@opentui/core'
import { theme } from '../theme'
import type {
  ApplyResult,
  BranchProtection,
  BranchProtectionInput,
} from '../types'

function logToFile(message: string) {
  try {
    const logPath = `${process.env.HOME}/.config/repoprotector/apply.log`
    const timestamp = new Date().toISOString()
    const entry = `[${timestamp}] ${message}\n`
    Bun.write(logPath, entry).catch(() => {})
  } catch (_e) {
    // Ignore logging errors
  }
}

export type PreviewConfirmCallback = () => void
export type PreviewCancelCallback = () => void

function formatValue(val: unknown, indent: string = ''): string[] {
  if (val === null) return [`${indent}null`]
  if (val === undefined) return [`${indent}undefined`]
  if (typeof val === 'boolean') return [`${indent}${val}`]
  if (typeof val === 'number') return [`${indent}${val}`]
  if (typeof val === 'string') return [`${indent}"${val}"`]
  if (Array.isArray(val)) {
    if (val.length === 0) return [`${indent}[]`]
    const lines: string[] = [`${indent}[`]
    for (const item of val) {
      lines.push(...formatValue(item, `${indent}  `))
    }
    lines.push(`${indent}]`)
    return lines
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>)
    if (entries.length === 0) return [`${indent}{}`]
    const lines: string[] = [`${indent}{`]
    for (const [k, v] of entries) {
      const subLines = formatValue(v, `${indent}  `)
      lines.push(`${subLines[0]?.replace(`${indent}  `, `${indent}  ${k}: `)}`)
      lines.push(...subLines.slice(1))
    }
    lines.push(`${indent}}`)
    return lines
  }
  return [`${indent}${String(val)}`]
}

function diffProtection(
  current: BranchProtection | null,
  proposed: BranchProtectionInput,
): { added: string[]; removed: string[]; changed: string[] } {
  const added: string[] = []
  const removed: string[] = []
  const changed: string[] = []

  const keys = new Set([
    ...Object.keys(current || {}),
    ...Object.keys(proposed),
  ])

  for (const key of keys) {
    if (key === 'url') continue

    const currentVal = current
      ? (current as unknown as Record<string, unknown>)[key]
      : undefined
    const proposedVal = (proposed as Record<string, unknown>)[key]

    if (currentVal === undefined && proposedVal !== undefined) {
      added.push(key)
    } else if (currentVal !== undefined && proposedVal === undefined) {
      removed.push(key)
    } else if (JSON.stringify(currentVal) !== JSON.stringify(proposedVal)) {
      changed.push(key)
    }
  }

  return { added, removed, changed }
}

export function createPreviewPane(
  renderer: CliRenderer,
  onConfirm: PreviewConfirmCallback,
  onCancel: PreviewCancelCallback,
): BoxRenderable {
  const container = new BoxRenderable(renderer, {
    id: 'preview-pane',
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    backgroundColor: theme.panelBg,
    padding: 1,
  })

  const title = new TextRenderable(renderer, {
    id: 'preview-title',
    content: 'Preview Changes',
    fg: theme.accent,
  })

  const contentBox = new BoxRenderable(renderer, {
    id: 'preview-content',
    width: '100%',
    flexGrow: 1,
    flexDirection: 'column',
    backgroundColor: theme.bg,
    padding: 1,
  })

  const footer = new BoxRenderable(renderer, {
    id: 'preview-footer',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  })

  const helpText = new TextRenderable(renderer, {
    id: 'preview-help',
    content: 'Enter Apply  |  Esc Cancel',
    fg: theme.textMuted,
  })

  const state: {
    current: BranchProtection | null
    proposed: BranchProtectionInput | null
    results: ApplyResult[]
    mode: 'diff' | 'results'
  } = {
    current: null,
    proposed: null,
    results: [],
    mode: 'diff',
  }

  const renderDiff = () => {
    contentBox.remove('diff-text')

    if (!state.proposed) {
      const text = new TextRenderable(renderer, {
        id: 'diff-text',
        content: 'No changes to preview',
        fg: theme.textMuted,
      })
      contentBox.add(text)
      return
    }

    const diff = diffProtection(state.current, state.proposed)
    const lines: string[] = []

    if (diff.added.length > 0) {
      lines.push(`+ Added: ${diff.added.join(', ')}`)
    }
    if (diff.removed.length > 0) {
      lines.push(`- Removed: ${diff.removed.join(', ')}`)
    }
    if (diff.changed.length > 0) {
      lines.push(`~ Changed: ${diff.changed.join(', ')}`)
    }

    if (lines.length === 0) {
      lines.push('No changes detected')
    }

    lines.push('', '--- Proposed Settings ---')
    lines.push(...formatValue(state.proposed, '').slice(1, 30))

    const text = new TextRenderable(renderer, {
      id: 'diff-text',
      content: lines.join('\n'),
      fg: theme.text,
    })
    contentBox.add(text)
  }

  const renderResults = () => {
    contentBox.remove('results-text')

    const lines: string[] = ['Apply Results:', '']

    let success = 0
    let failed = 0

    for (const result of state.results) {
      if (result.success) {
        const msg = `✓ ${result.repo.full_name}:${result.branch}`
        lines.push(msg)
        logToFile(msg)
        success++
      } else {
        const msg = `✗ ${result.repo.full_name}:${result.branch} - ${result.error}`
        lines.push(msg)
        logToFile(msg)
        failed++
      }
    }

    const summary = `Total: ${state.results.length} | Success: ${success} | Failed: ${failed}`
    lines.push('', summary)
    logToFile(summary)

    const text = new TextRenderable(renderer, {
      id: 'results-text',
      content: lines.join('\n'),
      fg: theme.text,
    })
    contentBox.add(text)
  }

  const handleKey = (key: { name: string }) => {
    if (key.name === 'return' || key.name === 'enter') {
      if (state.mode === 'diff') {
        onConfirm()
      } else {
        onCancel()
      }
    } else if (key.name === 'escape') {
      onCancel()
    }
  }

  footer.add(helpText)
  container.add(title)
  container.add(contentBox)
  container.add(footer)

  const setDiff = (
    current: BranchProtection | null,
    proposed: BranchProtectionInput,
  ) => {
    state.current = current
    state.proposed = proposed
    state.mode = 'diff'
    renderDiff()
  }

  const setResults = (results: ApplyResult[]) => {
    state.results = results
    state.mode = 'results'
    renderResults()
  }

  return Object.assign(container, { setDiff, setResults, handleKey })
}

export type PreviewPaneWithMethods = BoxRenderable & {
  setDiff: (
    current: BranchProtection | null,
    proposed: BranchProtectionInput,
  ) => void
  setResults: (results: ApplyResult[]) => void
  handleKey: (key: { name: string }) => void
}
