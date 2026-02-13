import {
  BoxRenderable,
  type CliRenderer,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
} from '@opentui/core'
import { theme } from '../theme'
import type { Repository } from '../types'

export type ReposSelectedCallback = (repos: Repository[]) => void

interface RepoItem {
  repo: Repository
  selected: boolean
}

export function createRepoSelector(
  renderer: CliRenderer,
  onSelect: ReposSelectedCallback,
  onBack: () => void,
): BoxRenderable {
  const container = new BoxRenderable(renderer, {
    id: 'repo-selector',
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    backgroundColor: theme.panelBg,
    padding: 1,
  })

  const headerContainer = new BoxRenderable(renderer, {
    id: 'repo-header-container',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  })

  const title = new TextRenderable(renderer, {
    id: 'repo-title',
    content: 'Select Repositories',
    fg: theme.accent,
  })

  const countText = new TextRenderable(renderer, {
    id: 'repo-count',
    content: '0 selected',
    fg: theme.accentPurple,
  })

  const helpText = new TextRenderable(renderer, {
    id: 'repo-help',
    content: '↑/↓ Navigate  |  Space Toggle  |  Enter Confirm  |  Esc Back',
    fg: theme.textMuted,
  })

  const select = new SelectRenderable(renderer, {
    id: 'repo-select',
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

  const state: { repos: RepoItem[] } = { repos: [] }

  const updateCount = () => {
    const selected = state.repos.filter((r) => r.selected).length
    countText.content = `${selected} selected`
  }

  select.on(SelectRenderableEvents.ITEM_SELECTED, (_index, _option) => {
    const selectedRepos = state.repos
      .filter((r) => r.selected)
      .map((r) => r.repo)
    if (selectedRepos.length > 0) {
      onSelect(selectedRepos)
    }
  })

  const handleKey = (key: { name: string }) => {
    if (key.name === 'space') {
      const idx = select.getSelectedIndex()
      if (idx >= 0 && idx < state.repos.length) {
        state.repos[idx]!.selected = !state.repos[idx]!.selected
        updateSelectOptions(select, state.repos)
        updateCount()
      }
    } else if (key.name === 'escape') {
      onBack()
    }
  }

  headerContainer.add(title)
  headerContainer.add(countText)
  container.add(headerContainer)
  container.add(select)
  container.add(helpText)

  const setRepos = (repos: Repository[]) => {
    state.repos = repos.map((repo) => ({ repo, selected: false }))
    updateSelectOptions(select, state.repos)
    updateCount()
    select.focus()
  }

  const blur = () => {
    select.blur()
  }

  return Object.assign(container, { setRepos, handleKey, blur })
}

function updateSelectOptions(
  select: SelectRenderable,
  items: RepoItem[],
): void {
  select.options = items.map((item) => ({
    name: `${item.selected ? '✓' : '○'} ${item.repo.name}`,
    description: item.repo.private ? 'private' : 'public',
    value: item.repo,
  }))
}

export type RepoSelectorWithSet = BoxRenderable & {
  setRepos: (repos: Repository[]) => void
  handleKey: (key: { name: string }) => void
  blur: () => void
}
