import {
  BoxRenderable,
  TextRenderable,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
  type CliRenderer,
  type Renderable,
} from '@opentui/core'
import type { BranchProtectionInput } from '../types'
import { theme } from '../theme'
import { getRepoWorkflows, type Workflow } from '../api/github'

interface EditorField {
  key: string
  label: string
  type: 'boolean' | 'number' | 'string' | 'workflow-select'
  value: boolean | number | string | string[]
  parent?: string
}

export type ProtectionSaveCallback = (protection: BranchProtectionInput) => void
export type ProtectionCancelCallback = () => void

export function createProtectionEditor(
  renderer: CliRenderer,
  onSave: ProtectionSaveCallback,
  onCancel: ProtectionCancelCallback
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
    content: '↑/↓ Nav  |  Enter Toggle/Edit  |  Tab Next  |  Ctrl+A Apply  |  Esc Back',
    fg: theme.textMuted,
  })
  
  const state: { 
    protection: BranchProtectionInput
    fields: EditorField[]
    focusIndex: number
    inputs: Map<string, InputRenderable>
    rowIds: string[]
    workflows: Workflow[]
    repoInfo: { owner: string; repo: string } | null
    showWorkflowSelect: boolean
    workflowSelect: SelectRenderable | null
  } = {
    protection: createDefaultProtection(),
    fields: [],
    focusIndex: 0,
    inputs: new Map(),
    rowIds: [],
    workflows: [],
    repoInfo: null,
    showWorkflowSelect: false,
    workflowSelect: null,
  }
  
  const buildFields = (): EditorField[] => {
    const p = state.protection
    const fields: EditorField[] = [
      { key: 'enforce_admins', label: 'Enforce for admins', type: 'boolean', value: p.enforce_admins ?? false },
      { key: 'required_linear_history', label: 'Require linear history', type: 'boolean', value: p.required_linear_history ?? false },
      { key: 'allow_force_pushes', label: 'Allow force pushes', type: 'boolean', value: p.allow_force_pushes ?? false },
      { key: 'allow_deletions', label: 'Allow deletions', type: 'boolean', value: p.allow_deletions ?? false },
      { key: 'block_creations', label: 'Block creations', type: 'boolean', value: p.block_creations ?? false },
      { key: 'required_conversation_resolution', label: 'Require conversation resolution', type: 'boolean', value: p.required_conversation_resolution ?? true },
    ]
    
    if (p.required_pull_request_reviews) {
      const rpr = p.required_pull_request_reviews
      fields.push(
        { key: 'rpr_enabled', label: 'PR Reviews Enabled', type: 'boolean', value: true, parent: 'required_pull_request_reviews' },
        { key: 'dismiss_stale_reviews', label: '  Dismiss stale reviews', type: 'boolean', value: rpr.dismiss_stale_reviews ?? false, parent: 'required_pull_request_reviews' },
        { key: 'require_code_owner_reviews', label: '  Require code owner reviews', type: 'boolean', value: rpr.require_code_owner_reviews ?? false, parent: 'required_pull_request_reviews' },
        { key: 'required_approving_review_count', label: '  Required approvals', type: 'number', value: rpr.required_approving_review_count ?? 1, parent: 'required_pull_request_reviews' },
      )
    } else {
      fields.push({ key: 'rpr_enabled', label: 'PR Reviews Enabled', type: 'boolean', value: false, parent: 'required_pull_request_reviews' })
    }
    
    if (p.required_status_checks) {
      const rsc = p.required_status_checks
      fields.push(
        { key: 'rsc_enabled', label: 'Status Checks Enabled', type: 'boolean', value: true, parent: 'required_status_checks' },
        { key: 'strict', label: '  Require branches up-to-date', type: 'boolean', value: rsc.strict ?? false, parent: 'required_status_checks' },
        { key: 'contexts', label: '  Status checks (comma-sep)', type: 'string', value: rsc.contexts?.join(', ') ?? '', parent: 'required_status_checks' },
      )
      if (state.workflows.length > 0) {
        fields.push(
          { key: 'add_workflow', label: '  [+] Add workflow check', type: 'workflow-select', value: '', parent: 'required_status_checks' },
        )
      }
    } else {
      fields.push({ key: 'rsc_enabled', label: 'Status Checks Enabled', type: 'boolean', value: false, parent: 'required_status_checks' })
    }
    
    fields.push(
      { key: 'divider_apply', label: '─────────────────────────', type: 'boolean', value: false },
      { key: 'apply', label: '>>> APPLY PROTECTION <<<', type: 'boolean', value: false },
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
          if (!isNaN(num) && num >= 0) {
            field.value = num
            updateProtectionFromField(field)
          }
        })
        
        valueDisplay = input
        state.inputs.set(field.key, input)
      } else if (field.type === 'workflow-select') {
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
          ? { dismiss_stale_reviews: false, require_code_owner_reviews: false, required_approving_review_count: 1 }
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
  
  const addWorkflowCheck = (workflowName: string) => {
    const p = state.protection
    if (!p.required_status_checks) {
      p.required_status_checks = { strict: false, contexts: [] }
    }
    
    const checkName = workflowName
    if (!p.required_status_checks.contexts.includes(checkName)) {
      p.required_status_checks.contexts.push(checkName)
    }
    
    renderFields()
  }
  
  const showWorkflowSelector = () => {
    if (state.workflows.length === 0) return
    
    clearRows()
    state.showWorkflowSelect = true
    
    const titleText = new TextRenderable(renderer, {
      id: 'workflow-title',
      content: 'Select Workflow to Add as Status Check',
      fg: theme.accent,
    })
    scrollContent.add(titleText)
    state.rowIds.push('workflow-title')
    
    const select = new SelectRenderable(renderer, {
      id: 'workflow-select',
      width: '100%',
      flexGrow: 1,
      backgroundColor: theme.bg,
      selectedBackgroundColor: theme.selectedBg,
      selectedTextColor: theme.accent,
      textColor: theme.text,
      descriptionColor: theme.textMuted,
      focusedBackgroundColor: theme.panelBg,
      showDescription: true,
    })
    
    select.options = state.workflows.map((w) => ({
      name: w.name,
      description: w.path,
      value: w.name,
    }))
    
    select.on(SelectRenderableEvents.ITEM_SELECTED, (_index, option) => {
      if (option?.value) {
        addWorkflowCheck(option.value as string)
      }
    })
    
    scrollContent.add(select)
    state.rowIds.push('workflow-select')
    state.workflowSelect = select
    select.focus()
  }
  
  const handleKey = (key: { name: string; shift: boolean; ctrl: boolean }) => {
    if (state.showWorkflowSelect && key.name === 'escape') {
      state.showWorkflowSelect = false
      renderFields()
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
      } else if (field.type === 'workflow-select') {
        showWorkflowSelector()
      }
    } else if (key.name === 'escape') {
      onCancel()
    } else if (key.name === 'up' || key.name === 'k') {
      state.focusIndex = (state.focusIndex - 1 + state.fields.length) % state.fields.length
      renderFields()
    } else if (key.name === 'down' || key.name === 'j') {
      state.focusIndex = (state.focusIndex + 1) % state.fields.length
      renderFields()
    }
  }
  
  renderer.keyInput.on('keypress', handleKey)
  
  footer.add(helpText)
  container.add(title)
  container.add(scrollContent)
  container.add(footer)
  
  const setProtection = (protection: BranchProtectionInput | null) => {
    state.protection = protection ? { ...protection } : createDefaultProtection()
    state.focusIndex = 0
    renderFields()
  }
  
  const getProtection = (): BranchProtectionInput => state.protection
  
  const setRepoInfo = async (owner: string, repo: string) => {
    state.repoInfo = { owner, repo }
    state.workflows = await getRepoWorkflows(owner, repo)
    renderFields()
  }
  
  renderFields()
  
  return Object.assign(container, { setProtection, getProtection, setRepoInfo })
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
}
