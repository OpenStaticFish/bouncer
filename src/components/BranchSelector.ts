import {
  BoxRenderable,
  type CliRenderer,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
} from '@opentui/core'
import { theme } from '../theme'
import type { Branch } from '../types'

export type BranchSelectedCallback = (branch: string) => void

export function createBranchSelector(
  renderer: CliRenderer,
  onSelect: BranchSelectedCallback,
  onBack: () => void,
): BoxRenderable {
  const container = new BoxRenderable(renderer, {
    id: 'branch-selector',
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    backgroundColor: theme.panelBg,
    padding: 1,
  })

  const title = new TextRenderable(renderer, {
    id: 'branch-title',
    content: 'Select Branch',
    fg: theme.accent,
  })

  const helpText = new TextRenderable(renderer, {
    id: 'branch-help',
    content: '↑/↓ Navigate  |  Enter Select  |  Esc Back',
    fg: theme.textMuted,
  })

  const select = new SelectRenderable(renderer, {
    id: 'branch-select',
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

  select.on(SelectRenderableEvents.ITEM_SELECTED, (_index, option) => {
    if (option?.value) {
      onSelect(option.value as string)
    }
  })

  const handleKey = (key: { name: string }) => {
    if (key.name === 'escape') {
      onBack()
    }
  }

  container.add(title)
  container.add(select)
  container.add(helpText)

  const setBranches = (branches: Branch[]) => {
    select.options = branches.map((branch) => ({
      name: branch.name,
      description: branch.protected ? '🔒 protected' : 'unprotected',
      value: branch.name,
    }))
    select.focus()
  }

  const blur = () => {
    select.blur()
  }

  return Object.assign(container, { setBranches, handleKey, blur })
}

export type BranchSelectorWithSet = BoxRenderable & {
  setBranches: (branches: Branch[]) => void
  handleKey: (key: { name: string }) => void
  blur: () => void
}
