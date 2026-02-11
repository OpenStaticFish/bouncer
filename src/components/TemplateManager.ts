import {
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  InputRenderable,
  InputRenderableEvents,
  type CliRenderer,
} from '@opentui/core'
import type { Template, BranchProtectionInput } from '../types'
import { theme } from '../theme'
import { listTemplates, saveTemplate, deleteTemplate } from '../utils/templates'

export type TemplateSelectCallback = (protection: BranchProtectionInput) => void
export type TemplateCancelCallback = () => void

export function createTemplateManager(
  renderer: CliRenderer,
  onSelect: TemplateSelectCallback,
  onCancel: TemplateCancelCallback
): BoxRenderable {
  const container = new BoxRenderable(renderer, {
    id: 'template-manager',
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    backgroundColor: theme.panelBg,
    padding: 1,
  })
  
  const title = new TextRenderable(renderer, {
    id: 'template-title',
    content: 'Templates',
    fg: theme.accent,
  })
  
  const select = new SelectRenderable(renderer, {
    id: 'template-select',
    width: '100%',
    flexGrow: 1,
    backgroundColor: theme.bg,
    selectedBackgroundColor: theme.selectedBg,
    selectedTextColor: theme.accent,
    textColor: theme.text,
    descriptionColor: theme.textMuted,
    focusedBackgroundColor: theme.panelBg,
    showDescription: true,
    wrapSelection: true,
  })
  
  const footer = new BoxRenderable(renderer, {
    id: 'template-footer',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  })
  
  const helpText = new TextRenderable(renderer, {
    id: 'template-help',
    content: 'Enter Load  |  d Delete  |  Ctrl+S Save Current  |  Esc Back',
    fg: theme.textMuted,
  })
  
  const state: { templates: Template[] } = { templates: [] }
  
  const loadTemplates = async () => {
    state.templates = await listTemplates()
    select.options = state.templates.map((t) => ({
      name: t.name,
      description: t.description || 'No description',
      value: t,
    }))
  }
  
  select.on(SelectRenderableEvents.ITEM_SELECTED, (_index, option) => {
    if (option?.value) {
      const template = option.value as Template
      onSelect(template.protection)
    }
  })
  
  renderer.keyInput.on('keypress', async (key: { name: string; ctrl: boolean }) => {
    if (key.name === 'escape') {
      onCancel()
    } else if (key.name === 'd') {
      const idx = select.getSelectedIndex()
      if (idx >= 0 && idx < state.templates.length) {
        const template = state.templates[idx]!
        await deleteTemplate(template.name)
        await loadTemplates()
      }
    } else if (key.ctrl && key.name === 's') {
      // This will be handled by the parent app
    }
  })
  
  footer.add(helpText)
  container.add(title)
  container.add(select)
  container.add(footer)
  
  select.focus()
  loadTemplates()
  
  const refresh = () => loadTemplates()
  
  return Object.assign(container, { refresh })
}

export type TemplateManagerWithRefresh = BoxRenderable & { refresh: () => Promise<void> }
