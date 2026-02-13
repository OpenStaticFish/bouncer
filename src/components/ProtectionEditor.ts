import {
  BoxRenderable,
  type CliRenderer,
  InputRenderable,
  InputRenderableEvents,
  type Renderable,
  TextRenderable,
} from '@opentui/core'
import { type CheckJob, getAvailableChecks } from '../api/github'
import { theme } from '../theme'
import type { BranchProtectionInput } from '../types'

interface EditorField {
  key: string
  label: string
  type: 'boolean' | 'number' | 'string' | 'check-select'
  value: boolean | number | string | string[]
  parent?: string
}

interface CheckItem {
  check: CheckJob
  selected: boolean
}

export type ProtectionSaveCallback = (protection: BranchProtectionInput) => void
export type ProtectionCancelCallback = () => void

export function createProtectionEditor(
  renderer: CliRenderer,
  onSave: ProtectionSaveCallback,
  onCancel: ProtectionCancelCallback,
): BoxRenderable {
  const container = new BoxRenderable(renderer, {
    id: 'protection-editor',
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    backgroundColor: theme.panelBg,
    padding: 1,
  })

  const title = new TextRenderable(renderer, {
    id: 'editor-title',
    content: 'Branch Protection Settings',
    fg: theme.accent,
  })

  const scrollContent = new BoxRenderable(renderer, {
    id: 'editor-scroll',
    width: '100%',
    flexGrow: 1,
    flexDirection: 'column',
    gap: 0,
  })

  const footer = new BoxRenderable(renderer, {
    id: 'editor-footer',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  })

  const helpText = new TextRenderable(renderer, {
    id: 'editor-help',
    content:
      '↑/↓ Nav  |  Enter Toggle/Edit  |  Tab Next  |  Ctrl+A Apply  |  Esc Back',
    fg: theme.textMuted,
  })

  const state: {
    protection: BranchProtectionInput
    fields: EditorField[]
    focusIndex: number
    inputs: Map<string, InputRenderable>
    rowIds: string[]
    availableChecks: CheckJob[]
    repoInfo: { owner: string; repo: string } | null
    showCheckModal: boolean
    checkItems: CheckItem[]
    checkFocusIndex: number
    modalRowIds: string[]
  } = {
    protection: createDefaultProtection(),
    fields: [],
    focusIndex: 0,
    inputs: new Map(),
    rowIds: [],
    availableChecks: [],
    repoInfo: null,
    showCheckModal: false,
    checkItems: [],
    checkFocusIndex: 0,
    modalRowIds: [],
  }

  const buildFields = (): EditorField[] => {
    const p = state.protection
    const fields: EditorField[] = [
      {
        key: 'enforce_admins',
        label: 'Enforce for admins',
        type: 'boolean',
        value: p.enforce_admins ?? false,
      },
      {
        key: 'required_linear_history',
        label: 'Require linear history',
        type: 'boolean',
        value: p.required_linear_history ?? false,
      },
      {
        key: 'allow_force_pushes',
        label: 'Allow force pushes',
        type: 'boolean',
        value: p.allow_force_pushes ?? false,
      },
      {
        key: 'allow_deletions',
        label: 'Allow deletions',
        type: 'boolean',
        value: p.allow_deletions ?? false,
      },
      {
        key: 'block_creations',
        label: 'Block creations',
        type: 'boolean',
        value: p.block_creations ?? false,
      },
      {
        key: 'required_conversation_resolution',
        label: 'Require conversation resolution',
        type: 'boolean',
        value: p.required_conversation_resolution ?? true,
      },
    ]

    if (p.required_pull_request_reviews) {
      const rpr = p.required_pull_request_reviews
      fields.push(
        {
          key: 'rpr_enabled',
          label: 'PR Reviews Enabled',
          type: 'boolean',
          value: true,
          parent: 'required_pull_request_reviews',
        },
        {
          key: 'dismiss_stale_reviews',
          label: '  Dismiss stale reviews',
          type: 'boolean',
          value: rpr.dismiss_stale_reviews ?? false,
          parent: 'required_pull_request_reviews',
        },
        {
          key: 'require_code_owner_reviews',
          label: '  Require code owner reviews',
          type: 'boolean',
          value: rpr.require_code_owner_reviews ?? false,
          parent: 'required_pull_request_reviews',
        },
        {
          key: 'required_approving_review_count',
          label: '  Required approvals',
          type: 'number',
          value: rpr.required_approving_review_count ?? 1,
          parent: 'required_pull_request_reviews',
        },
      )
    } else {
      fields.push({
        key: 'rpr_enabled',
        label: 'PR Reviews Enabled',
        type: 'boolean',
        value: false,
        parent: 'required_pull_request_reviews',
      })
    }

    if (p.required_status_checks) {
      const rsc = p.required_status_checks
      fields.push(
        {
          key: 'rsc_enabled',
          label: 'Status Checks Enabled',
          type: 'boolean',
          value: true,
          parent: 'required_status_checks',
        },
        {
          key: 'strict',
          label: '  Require branches up-to-date',
          type: 'boolean',
          value: rsc.strict ?? false,
          parent: 'required_status_checks',
        },
        {
          key: 'contexts',
          label: '  Status checks (comma-sep)',
          type: 'string',
          value: rsc.contexts?.join(', ') ?? '',
          parent: 'required_status_checks',
        },
      )
      if (state.availableChecks.length > 0) {
        fields.push({
          key: 'add_check',
          label: '  [+] Add status checks from CI',
          type: 'check-select',
          value: '',
          parent: 'required_status_checks',
        })
      }
    } else {
      fields.push({
        key: 'rsc_enabled',
        label: 'Status Checks Enabled',
        type: 'boolean',
        value: false,
        parent: 'required_status_checks',
      })
    }

    fields.push(
      {
        key: 'divider_apply',
        label: '─────────────────────────',
        type: 'boolean',
        value: false,
      },
      {
        key: 'apply',
        label: '>>> APPLY PROTECTION <<<',
        type: 'boolean',
        value: false,
      },
    )

    return fields
  }

  const clearRows = () => {
    for (const rowId of state.rowIds) {
      scrollContent.remove(rowId)
    }
    state.rowIds = []
    state.inputs.clear()
  }

  const renderFields = () => {
    clearRows()
    state.fields = buildFields()

    for (let i = 0; i < state.fields.length; i++) {
      const field = state.fields[i]!
      const isFocused = i === state.focusIndex
      const rowId = `field-row-${i}`

      if (field.key === 'divider_apply') {
        const divider = new TextRenderable(renderer, {
          id: rowId,
          content: field.label,
          fg: theme.textDim,
        })
        scrollContent.add(divider)
        state.rowIds.push(rowId)
        continue
      }

      if (field.key === 'apply') {
        const applyBtn = new BoxRenderable(renderer, {
          id: rowId,
          width: '100%',
          flexDirection: 'row',
          justifyContent: 'center',
          padding: 1,
          backgroundColor: isFocused ? theme.accent : theme.selectedBg,
        })

        const btnText = new TextRenderable(renderer, {
          id: `btn-text-${rowId}`,
          content: '>>> APPLY PROTECTION <<<',
          fg: isFocused ? theme.bg : theme.text,
        })

        applyBtn.add(btnText)
        scrollContent.add(applyBtn)
        state.rowIds.push(rowId)
        continue
      }

      const row = new BoxRenderable(renderer, {
        id: rowId,
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 0,
        backgroundColor: isFocused ? theme.selectedBg : 'transparent',
      })

      const label = new TextRenderable(renderer, {
        id: `label-${rowId}`,
        content: field.label,
        fg: field.parent ? theme.textMuted : theme.text,
      })

      let valueDisplay: Renderable

      if (field.type === 'boolean') {
        valueDisplay = new TextRenderable(renderer, {
          id: `value-${rowId}`,
          content: field.value ? '[✓]' : '[ ]',
          fg: field.value ? theme.success : theme.textDim,
        })
      } else if (field.type === 'number') {
        const input = new InputRenderable(renderer, {
          id: `input-${rowId}`,
          width: 10,
          value: String(field.value),
          backgroundColor: isFocused ? theme.input.focusedBg : theme.input.bg,
          textColor: theme.text,
          cursorColor: theme.input.cursor,
        })

        input.on(InputRenderableEvents.INPUT, (val: string) => {
          const num = parseInt(val, 10)
          if (!Number.isNaN(num) && num >= 0) {
            field.value = num
            updateProtectionFromField(field)
          }
        })

        valueDisplay = input
        state.inputs.set(field.key, input)
      } else if (field.type === 'check-select') {
        const btn = new TextRenderable(renderer, {
          id: `value-${rowId}`,
          content: '<Enter to select>',
          fg: theme.accent,
        })
        valueDisplay = btn
      } else {
        const input = new InputRenderable(renderer, {
          id: `input-${rowId}`,
          width: 40,
          value: String(field.value),
          backgroundColor: isFocused ? theme.input.focusedBg : theme.input.bg,
          textColor: theme.text,
          cursorColor: theme.input.cursor,
        })

        input.on(InputRenderableEvents.INPUT, (val: string) => {
          field.value = val
          updateProtectionFromField(field)
        })

        valueDisplay = input
        state.inputs.set(field.key, input)
      }

      row.add(label)
      row.add(valueDisplay)
      scrollContent.add(row)
      state.rowIds.push(rowId)
    }

    focusCurrentField()
  }

  const updateProtectionFromField = (field: EditorField) => {
    const p = state.protection

    if (field.parent === 'required_pull_request_reviews') {
      if (field.key === 'rpr_enabled') {
        p.required_pull_request_reviews = field.value
          ? {
              dismiss_stale_reviews: false,
              require_code_owner_reviews: false,
              required_approving_review_count: 1,
            }
          : null
        renderFields()
        return
      }

      if (p.required_pull_request_reviews) {
        const rpr = p.required_pull_request_reviews
        if (field.key === 'dismiss_stale_reviews') {
          rpr.dismiss_stale_reviews = field.value as boolean
        } else if (field.key === 'require_code_owner_reviews') {
          rpr.require_code_owner_reviews = field.value as boolean
        } else if (field.key === 'required_approving_review_count') {
          rpr.required_approving_review_count = field.value as number
        }
      }
    } else if (field.parent === 'required_status_checks') {
      if (field.key === 'rsc_enabled') {
        p.required_status_checks = field.value
          ? { strict: false, contexts: [] }
          : null
        renderFields()
        return
      }

      if (p.required_status_checks) {
        const rsc = p.required_status_checks
        if (field.key === 'strict') {
          rsc.strict = field.value as boolean
        } else if (field.key === 'contexts') {
          rsc.contexts = (field.value as string)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        }
      }
    } else {
      switch (field.key) {
        case 'enforce_admins':
          p.enforce_admins = field.value as boolean
          break
        case 'required_linear_history':
          p.required_linear_history = field.value as boolean
          break
        case 'allow_force_pushes':
          p.allow_force_pushes = field.value as boolean
          break
        case 'allow_deletions':
          p.allow_deletions = field.value as boolean
          break
        case 'block_creations':
          p.block_creations = field.value as boolean
          break
        case 'required_conversation_resolution':
          p.required_conversation_resolution = field.value as boolean
          break
      }
    }
  }

  const focusCurrentField = () => {
    const field = state.fields[state.focusIndex]
    if (!field) return

    if (field.type === 'number' || field.type === 'string') {
      const input = state.inputs.get(field.key)
      if (input) {
        input.focus()
      }
    }
  }

  const addCheckNames = (checkNames: string[]) => {
    const p = state.protection
    if (!p.required_status_checks) {
      p.required_status_checks = { strict: false, contexts: [] }
    }

    for (const name of checkNames) {
      if (!p.required_status_checks.contexts.includes(name)) {
        p.required_status_checks.contexts.push(name)
      }
    }

    renderFields()
  }

  const clearModalRows = () => {
    for (const rowId of state.modalRowIds) {
      container.remove(rowId)
    }
    state.modalRowIds = []
  }

  const renderCheckModal = () => {
    clearModalRows()

    const modalOverlay = new BoxRenderable(renderer, {
      id: 'check-modal-overlay',
      position: 'absolute',
      top: 3,
      left: 2,
      right: 2,
      bottom: 2,
      backgroundColor: theme.bg,
      borderStyle: 'rounded',
      borderColor: theme.accent,
      flexDirection: 'column',
      padding: 1,
    })

    const modalTitle = new TextRenderable(renderer, {
      id: 'modal-title',
      content: 'Select CI Job Names to Add as Required Checks',
      fg: theme.accent,
    })
    modalOverlay.add(modalTitle)

    const modalHelp = new TextRenderable(renderer, {
      id: 'modal-help',
      content: 'Space Toggle  |  Enter Apply  |  Esc Cancel',
      fg: theme.textMuted,
    })

    const listContainer = new BoxRenderable(renderer, {
      id: 'check-list',
      width: '100%',
      flexGrow: 1,
      flexDirection: 'column',
      backgroundColor: theme.panelBg,
      padding: 1,
    })

    for (let i = 0; i < state.checkItems.length; i++) {
      const item = state.checkItems[i]!
      const isFocused = i === state.checkFocusIndex
      const rowId = `check-row-${i}`

      const row = new BoxRenderable(renderer, {
        id: rowId,
        width: '100%',
        flexDirection: 'row',
        backgroundColor: isFocused ? theme.selectedBg : 'transparent',
        padding: 0,
      })

      const checkbox = new TextRenderable(renderer, {
        id: `checkbox-${i}`,
        content: item.selected ? '✓ ' : '○ ',
        fg: item.selected ? theme.success : theme.textDim,
      })

      const name = new TextRenderable(renderer, {
        id: `name-${i}`,
        content: item.check.name,
        fg: isFocused ? theme.accent : theme.text,
      })

      const workflow = new TextRenderable(renderer, {
        id: `workflow-${i}`,
        content: `  (${item.check.workflowName})`,
        fg: theme.textMuted,
      })

      row.add(checkbox)
      row.add(name)
      row.add(workflow)
      listContainer.add(row)
    }

    const countText = new TextRenderable(renderer, {
      id: 'selected-count',
      content: `${state.checkItems.filter((c) => c.selected).length} selected`,
      fg: theme.accentPurple,
    })

    modalOverlay.add(listContainer)
    modalOverlay.add(countText)
    modalOverlay.add(modalHelp)

    container.add(modalOverlay)
    state.modalRowIds.push('check-modal-overlay')
  }

  const showCheckModal = () => {
    if (state.availableChecks.length === 0) {
      return
    }

    state.checkItems = state.availableChecks.map((c) => {
      const alreadyAdded =
        state.protection.required_status_checks?.contexts?.includes(c.name) ??
        false
      return { check: c, selected: alreadyAdded }
    })
    state.checkFocusIndex = 0
    state.showCheckModal = true

    renderCheckModal()
  }

  const handleKey = (key: { name: string; shift: boolean; ctrl: boolean }) => {
    if (state.showCheckModal) {
      if (key.name === 'escape') {
        state.showCheckModal = false
        clearModalRows()
        renderFields()
        return
      }

      if (key.name === 'up' || key.name === 'k') {
        state.checkFocusIndex =
          (state.checkFocusIndex - 1 + state.checkItems.length) %
          state.checkItems.length
        renderCheckModal()
        return
      }

      if (key.name === 'down' || key.name === 'j') {
        state.checkFocusIndex =
          (state.checkFocusIndex + 1) % state.checkItems.length
        renderCheckModal()
        return
      }

      if (key.name === 'space') {
        const item = state.checkItems[state.checkFocusIndex]
        if (item) {
          item.selected = !item.selected
          renderCheckModal()
        }
        return
      }

      if (key.name === 'return' || key.name === 'enter') {
        state.showCheckModal = false
        clearModalRows()
        const selected = state.checkItems
          .filter((c) => c.selected)
          .map((c) => c.check.name)
        if (selected.length > 0) {
          addCheckNames(selected)
        } else {
          renderFields()
        }
        return
      }

      return
    }

    if (key.ctrl && key.name === 'a') {
      onSave(state.protection)
      return
    }

    if (key.name === 'tab') {
      state.focusIndex = key.shift
        ? (state.focusIndex - 1 + state.fields.length) % state.fields.length
        : (state.focusIndex + 1) % state.fields.length
      renderFields()
    } else if (key.name === 'return' || key.name === 'enter') {
      const field = state.fields[state.focusIndex]
      if (!field) return

      if (field.key === 'apply') {
        onSave(state.protection)
        return
      }

      if (field.type === 'boolean') {
        field.value = !field.value
        updateProtectionFromField(field)
        renderFields()
      } else if (field.type === 'check-select') {
        showCheckModal()
      }
    } else if (key.name === 'escape') {
      onCancel()
    } else if (key.name === 'up' || key.name === 'k') {
      state.focusIndex =
        (state.focusIndex - 1 + state.fields.length) % state.fields.length
      renderFields()
    } else if (key.name === 'down' || key.name === 'j') {
      state.focusIndex = (state.focusIndex + 1) % state.fields.length
      renderFields()
    }
  }

  footer.add(helpText)
  container.add(title)
  container.add(scrollContent)
  container.add(footer)

  const setProtection = (protection: BranchProtectionInput | null) => {
    state.protection = protection
      ? { ...protection }
      : createDefaultProtection()
    state.focusIndex = 0
    renderFields()
  }

  const getProtection = (): BranchProtectionInput => state.protection

  const setRepoInfo = async (owner: string, repo: string) => {
    state.repoInfo = { owner, repo }
    state.availableChecks = await getAvailableChecks(owner, repo)
    renderFields()
  }

  renderFields()

  return Object.assign(container, {
    setProtection,
    getProtection,
    setRepoInfo,
    handleKey,
  })
}

function createDefaultProtection(): BranchProtectionInput {
  return {
    required_pull_request_reviews: {
      dismiss_stale_reviews: false,
      require_code_owner_reviews: false,
      required_approving_review_count: 1,
    },
    required_status_checks: null,
    enforce_admins: false,
    required_linear_history: false,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_conversation_resolution: true,
    restrictions: null,
  }
}

export type ProtectionEditorWithMethods = BoxRenderable & {
  setProtection: (protection: BranchProtectionInput | null) => void
  getProtection: () => BranchProtectionInput
  setRepoInfo: (owner: string, repo: string) => Promise<void>
  handleKey: (key: { name: string; shift: boolean; ctrl: boolean }) => void
}
