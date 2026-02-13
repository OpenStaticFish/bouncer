import {
  BoxRenderable,
  type CliRenderer,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
} from '@opentui/core'
import { theme } from '../theme'
import type { BranchProtectionInput, Template } from '../types'
import { deleteTemplate, listTemplates } from '../utils/templates'

export type TemplateSelectCallback = (protection: BranchProtectionInput) => void
export type TemplateCancelCallback = () => void

export function createTemplateManager(
  renderer: CliRenderer,
  onSelect: TemplateSelectCallback,
  onCancel: TemplateCancelCallback,
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
    content: 'Enter Load  |  d Delete  |  Esc Back',
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

  const handleKey = async (key: { name: string }) => {
    if (key.name === 'escape') {
      onCancel()
    } else if (key.name === 'd') {
      const idx = select.getSelectedIndex()
      if (idx >= 0 && idx < state.templates.length) {
        const template = state.templates[idx]!
        await deleteTemplate(template.name)
        await loadTemplates()
      }
    }
  }

  footer.add(helpText)
  container.add(title)
  container.add(select)
  container.add(footer)

  const refresh = async () => {
    await loadTemplates()
    select.focus()
  }

  const blur = () => {
    select.blur()
  }

  return Object.assign(container, { refresh, handleKey, blur })
}

export type TemplateManagerWithRefresh = BoxRenderable & {
  refresh: () => Promise<void>
  handleKey: (key: { name: string }) => Promise<void>
  blur: () => void
}
