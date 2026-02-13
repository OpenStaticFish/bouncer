import { BoxRenderable, createCliRenderer, TextRenderable } from '@opentui/core'

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

import {
  applyProtectionToMultiple,
  detectLocalRepo,
  getBranchProtection,
  getOrganizations,
  getOrgRepos,
  getRepoBranches,
} from './api/github'
import {
  type BranchSelectorWithSet,
  createBranchSelector,
} from './components/BranchSelector'
import {
  blurSelect,
  createOrgSelector,
  updateOrgOptions,
} from './components/OrgSelector'
import {
  createPreviewPane,
  type PreviewPaneWithMethods,
} from './components/PreviewPane'
import {
  createProtectionEditor,
  type ProtectionEditorWithMethods,
} from './components/ProtectionEditor'
import {
  createRepoSelector,
  type RepoSelectorWithSet,
} from './components/RepoSelector'
import {
  createTemplateManager,
  type TemplateManagerWithRefresh,
} from './components/TemplateManager'
import { theme } from './theme'
import type {
  ApplyResult,
  BranchProtection,
  BranchProtectionInput,
  Organization,
  Repository,
} from './types'
import { initializeDefaultTemplates, saveTemplate } from './utils/templates'

type Screen = 'orgs' | 'repos' | 'branches' | 'editor' | 'templates' | 'preview'

type KeyHandler = (key: {
  name: string
  shift: boolean
  ctrl: boolean
}) => void | Promise<void>

export async function runApp(localMode: boolean = false): Promise<void> {
  await initializeDefaultTemplates()

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useMouse: false,
  })

  const state: {
    screen: Screen
    org: Organization | null
    repos: Repository[]
    selectedRepos: Repository[]
    branch: string | null
    currentProtection: BranchProtection | null
    proposedProtection: BranchProtectionInput | null
    results: ApplyResult[]
    isLoading: boolean
    error: string | null
  } = {
    screen: 'orgs',
    org: null,
    repos: [],
    selectedRepos: [],
    branch: null,
    currentProtection: null,
    proposedProtection: null,
    results: [],
    isLoading: false,
    error: null,
  }

  const root = new BoxRenderable(renderer, {
    id: 'root',
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    backgroundColor: theme.bg,
  })

  const header = new BoxRenderable(renderer, {
    id: 'header',
    width: '100%',
    height: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.panelBg,
    padding: 1,
  })

  const headerTitle = new TextRenderable(renderer, {
    id: 'header-title',
    content: 'RepoProtector',
    fg: theme.accent,
  })
  const headerBreadcrumb = new TextRenderable(renderer, {
    id: 'header-breadcrumb',
    content: '',
    fg: theme.textMuted,
  })

  const mainContent = new BoxRenderable(renderer, {
    id: 'main-content',
    width: '100%',
    flexGrow: 1,
    flexDirection: 'column',
    backgroundColor: theme.bg,
  })

  const footer = new BoxRenderable(renderer, {
    id: 'footer',
    width: '100%',
    height: 2,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: theme.panelBg,
    padding: 0,
  })

  const footerText = new TextRenderable(renderer, {
    id: 'footer-text',
    content: '',
    fg: theme.textMuted,
  })

  header.add(headerTitle)
  header.add(headerBreadcrumb)
  footer.add(footerText)
  root.add(header)
  root.add(mainContent)
  root.add(footer)
  renderer.root.add(root)

  let currentScreenComponent: BoxRenderable | null = null
  let currentKeyHandler: KeyHandler | null = null

  const updateBreadcrumb = () => {
    const parts: string[] = []
    if (state.org) parts.push(state.org.login)
    if (state.selectedRepos.length > 0) {
      parts.push(
        state.selectedRepos.length === 1
          ? state.selectedRepos[0]!.name
          : `${state.selectedRepos.length} repos`,
      )
    }
    if (state.branch) parts.push(state.branch)
    headerBreadcrumb.content = parts.join(' > ')
  }

  const updateFooter = (text: string) => {
    footerText.content = text
  }
  const showLoading = (message: string) => {
    state.isLoading = true
    updateFooter(`Loading... ${message}`)
  }
  const hideLoading = () => {
    state.isLoading = false
    updateFooter('')
  }
  const showError = (message: string) => {
    state.error = message
    updateFooter(`Error: ${message}`)
  }

  const clearScreen = () => {
    if (currentScreenComponent) {
      if (
        'blur' in currentScreenComponent &&
        typeof currentScreenComponent.blur === 'function'
      ) {
        ;(currentScreenComponent as { blur: () => void }).blur()
      }
      mainContent.remove(currentScreenComponent.id)
      currentScreenComponent = null
    }
    currentKeyHandler = null
  }

  const showOrgSelector = async () => {
    clearScreen()
    state.screen = 'orgs'
    updateBreadcrumb()
    updateFooter('Select an organization to manage')

    const result = createOrgSelector(renderer, (org) => {
      blurSelect(result.select)
      state.org = org
      showRepoSelector()
    })
    mainContent.add(result.container)
    currentScreenComponent = result.container

    showLoading('Fetching organizations...')
    try {
      const orgs = await getOrganizations()
      updateOrgOptions(result.select, orgs)
      hideLoading()
    } catch (err) {
      hideLoading()
      showError(
        err instanceof Error ? err.message : 'Failed to load organizations',
      )
    }
  }

  const showRepoSelector = async () => {
    if (!state.org) return
    clearScreen()
    state.screen = 'repos'
    updateBreadcrumb()
    updateFooter('Space to toggle, Enter to confirm')

    const container = createRepoSelector(
      renderer,
      (repos) => {
        container.blur()
        state.selectedRepos = repos
        showBranchSelector()
      },
      () => {
        container.blur()
        showOrgSelector()
      },
    ) as RepoSelectorWithSet

    mainContent.add(container)
    currentScreenComponent = container
    currentKeyHandler = (key) => {
      container.handleKey(key)
    }

    showLoading('Fetching repositories...')
    try {
      const repos = await getOrgRepos(state.org.login)
      state.repos = repos
      container.setRepos(repos)
      hideLoading()
    } catch (err) {
      hideLoading()
      showError(
        err instanceof Error ? err.message : 'Failed to load repositories',
      )
    }
  }

  const showBranchSelector = async () => {
    if (state.selectedRepos.length === 0) return
    clearScreen()
    state.screen = 'branches'
    updateBreadcrumb()
    updateFooter('Select a branch to protect')

    const repo = state.selectedRepos[0]!
    const container = createBranchSelector(
      renderer,
      async (branch) => {
        container.blur()
        state.branch = branch
        showLoading('Fetching current protection...')
        try {
          state.currentProtection = await getBranchProtection(
            repo.owner.login,
            repo.name,
            branch,
          )
          hideLoading()
          await showEditor()
        } catch (err) {
          hideLoading()
          showError(
            err instanceof Error ? err.message : 'Failed to load protection',
          )
        }
      },
      () => {
        container.blur()
        showRepoSelector()
      },
    ) as BranchSelectorWithSet

    mainContent.add(container)
    currentScreenComponent = container
    currentKeyHandler = (key) => {
      container.handleKey(key)
    }

    showLoading('Fetching branches...')
    try {
      const branches = await getRepoBranches(repo.owner.login, repo.name)
      container.setBranches(branches)
      hideLoading()
    } catch (err) {
      hideLoading()
      showError(err instanceof Error ? err.message : 'Failed to load branches')
    }
  }

  const showEditor = async () => {
    clearScreen()
    state.screen = 'editor'
    updateBreadcrumb()
    showLoading('Loading editor...')

    const repo = state.selectedRepos[0]!
    const container = createProtectionEditor(
      renderer,
      (protection) => {
        state.proposedProtection = protection
        showPreview()
      },
      () => showBranchSelector(),
    ) as ProtectionEditorWithMethods

    container.setProtection(state.currentProtection)

    mainContent.add(container)
    currentScreenComponent = container

    await container.setRepoInfo(repo.owner.login, repo.name)

    hideLoading()
    updateFooter('Configure protection settings')

    currentKeyHandler = (key) => {
      if (key.ctrl && key.name === 's' && state.proposedProtection) {
        const name = `template-${Date.now()}`
        saveTemplate(name, state.proposedProtection, 'Saved from editor')
        updateFooter(`Saved as template: ${name}`)
      } else if (key.ctrl && key.name === 't') {
        showTemplates()
        return
      }
      container.handleKey(key)
    }
  }

  const showTemplates = async () => {
    clearScreen()
    state.screen = 'templates'
    updateBreadcrumb()
    showLoading('Loading templates...')

    const container = createTemplateManager(
      renderer,
      (protection) => {
        container.blur()
        state.proposedProtection = protection
        showEditor()
        setTimeout(() => {
          if (
            currentScreenComponent &&
            'setProtection' in currentScreenComponent &&
            'setRepoInfo' in currentScreenComponent
          ) {
            const editor = currentScreenComponent as ProtectionEditorWithMethods
            editor.setProtection(protection)
            if (state.selectedRepos[0]) {
              editor.setRepoInfo(
                state.selectedRepos[0].owner.login,
                state.selectedRepos[0].name,
              )
            }
          }
        }, 50)
      },
      () => {
        container.blur()
        state.org ? showRepoSelector() : showOrgSelector()
      },
    ) as TemplateManagerWithRefresh

    mainContent.add(container)
    currentScreenComponent = container

    await container.refresh()
    hideLoading()
    updateFooter('Load a template')

    currentKeyHandler = async (key) => {
      await container.handleKey(key)
    }
  }

  const showPreview = () => {
    if (!state.proposedProtection) return
    clearScreen()
    state.screen = 'preview'
    updateBreadcrumb()
    updateFooter('Review and apply changes')

    const container = createPreviewPane(
      renderer,
      async () => {
        if (!state.proposedProtection) return
        showLoading('Applying protection...')
        const targets = state.selectedRepos.map((repo) => ({
          owner: repo.owner.login,
          repo: repo.name,
          branch: state.branch!,
        }))
        try {
          const results = await applyProtectionToMultiple(
            targets,
            state.proposedProtection,
          )
          logToFile(`Applied protection to ${targets.length} repo(s)`)
          logToFile(JSON.stringify(state.proposedProtection, null, 2))
          state.results = results
          hideLoading()
          container.setResults(results)
        } catch (err) {
          hideLoading()
          showError(
            err instanceof Error ? err.message : 'Failed to apply protection',
          )
        }
      },
      () => showEditor(),
    ) as PreviewPaneWithMethods

    container.setDiff(state.currentProtection, state.proposedProtection)
    mainContent.add(container)
    currentScreenComponent = container
    currentKeyHandler = (key) => {
      container.handleKey(key)
    }
  }

  renderer.keyInput.on(
    'keypress',
    (key: { name: string; shift: boolean; ctrl: boolean }) => {
      if (state.isLoading) return
      if (currentKeyHandler) {
        currentKeyHandler(key)
      }
    },
  )

  if (localMode) {
    showLoading('Detecting local repository...')
    const localRepo = await detectLocalRepo()
    if (localRepo) {
      state.org = { login: localRepo.owner } as Organization
      state.selectedRepos = [
        {
          name: localRepo.repo,
          full_name: `${localRepo.owner}/${localRepo.repo}`,
          owner: { login: localRepo.owner },
        } as Repository,
      ]
      hideLoading()
      showBranchSelector()
    } else {
      hideLoading()
      showError('Not in a git repository or gh not configured')
      showOrgSelector()
    }
  } else {
    showOrgSelector()
  }
}
