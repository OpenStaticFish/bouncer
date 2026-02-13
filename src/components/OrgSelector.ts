import {
  BoxRenderable,
  type CliRenderer,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
} from '@opentui/core'
import { theme } from '../theme'
import type { Organization } from '../types'

export type OrgSelectedCallback = (org: Organization) => void

export interface OrgSelectorResult {
  container: BoxRenderable
  select: SelectRenderable
}

export function createOrgSelector(
  renderer: CliRenderer,
  onSelect: OrgSelectedCallback,
): OrgSelectorResult {
  const container = new BoxRenderable(renderer, {
    id: 'org-selector',
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    backgroundColor: theme.panelBg,
    padding: 1,
  })

  const title = new TextRenderable(renderer, {
    id: 'org-title',
    content: 'Select Organization',
    fg: theme.accent,
  })

  const helpText = new TextRenderable(renderer, {
    id: 'org-help',
    content: '↑/↓ Navigate  |  Enter Select  |  Ctrl+C Quit',
    fg: theme.textMuted,
  })

  const select = new SelectRenderable(renderer, {
    id: 'org-select',
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
      onSelect(option.value as Organization)
    }
  })

  container.add(title)
  container.add(select)
  container.add(helpText)

  return { container, select }
}

export function updateOrgOptions(
  select: SelectRenderable,
  orgs: Organization[],
): void {
  select.options = orgs.map((org) => ({
    name: org.login,
    description: org.description || 'No description',
    value: org,
  }))
  select.focus()
}

export function blurSelect(select: SelectRenderable): void {
  select.blur()
}
