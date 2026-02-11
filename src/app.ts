import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  type CliRenderer,
} from '@opentui/core'
import type { 
  Organization, 
  Repository, 
  Branch, 
  BranchProtection, 
  BranchProtectionInput,
  ApplyResult 
} from './types'
import { theme } from './theme'
import { 
  getOrganizations, 
  getOrgRepos, 
  getRepoBranches, 
  getBranchProtection,
  applyProtectionToMultiple,
  detectLocalRepo,
} from './api/github'
import { initializeDefaultTemplates, saveTemplate } from './utils/templates'
import { createOrgSelector, updateOrgOptions, type OrgSelectorResult } from './components/OrgSelector'
import { createRepoSelector, type RepoSelectorWithSet } from './components/RepoSelector'
import { createBranchSelector, type BranchSelectorWithSet } from './components/BranchSelector'
import { createProtectionEditor, type ProtectionEditorWithMethods } from './components/ProtectionEditor'
import { createTemplateManager, type TemplateManagerWithRefresh } from './components/TemplateManager'
import { createPreviewPane, type PreviewPaneWithMethods } from './components/PreviewPane'

type Screen = 'orgs' | 'repos' | 'branches' | 'editor' | 'templates' | 'preview'

export async function runApp(localMode: boolean = false): Promise<void> {
  await initializeDefaultTemplates()
  
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
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
  
  const updateBreadcrumb = () => {
    const parts: string[] = []
    if (state.org) parts.push(state.org.login)
    if (state.selectedRepos.length > 0) {
      parts.push(state.selectedRepos.length === 1 
        ? state.selectedRepos[0]!.name 
        : `${state.selectedRepos.length} repos`)
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
      mainContent.remove(currentScreenComponent.id)
      currentScreenComponent = null
    }
  }
  
  const showOrgSelector = async () => {
    clearScreen()
    state.screen = 'orgs'
    updateBreadcrumb()
    updateFooter('Select an organization to manage')
    
    const result = createOrgSelector(renderer, (org) => {
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
      showError(err instanceof Error ? err.message : 'Failed to load organizations')
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
        state.selectedRepos = repos
        showBranchSelector()
      },
      () => showOrgSelector()
    ) as RepoSelectorWithSet
    
    mainContent.add(container)
    currentScreenComponent = container
    
    showLoading('Fetching repositories...')
    try {
      const repos = await getOrgRepos(state.org.login)
      state.repos = repos
      container.setRepos(repos)
      hideLoading()
    } catch (err) {
      hideLoading()
      showError(err instanceof Error ? err.message : 'Failed to load repositories')
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
        state.branch = branch
        showLoading('Fetching current protection...')
        try {
          state.currentProtection = await getBranchProtection(
            repo.owner.login,
            repo.name,
            branch
          )
          hideLoading()
          showEditor()
        } catch (err) {
          hideLoading()
          showError(err instanceof Error ? err.message : 'Failed to load protection')
        }
      },
      () => showRepoSelector()
    ) as BranchSelectorWithSet
    
    mainContent.add(container)
    currentScreenComponent = container
    
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
  
  const showEditor = () => {
    clearScreen()
    state.screen = 'editor'
    updateBreadcrumb()
    updateFooter('Configure protection settings')
    
    const repo = state.selectedRepos[0]!
    const container = createProtectionEditor(
      renderer,
      (protection) => {
        state.proposedProtection = protection
        showPreview()
      },
      () => showBranchSelector()
    ) as ProtectionEditorWithMethods
    
    container.setProtection(state.currentProtection)
    container.setRepoInfo(repo.owner.login, repo.name)
    
    mainContent.add(container)
    currentScreenComponent = container
  }
  
  const showTemplates = () => {
    clearScreen()
    state.screen = 'templates'
    updateBreadcrumb()
    updateFooter('Load a template')
    
    const container = createTemplateManager(
      renderer,
      (protection) => {
        state.proposedProtection = protection
        showEditor()
        
        setTimeout(() => {
          if (currentScreenComponent && 'setProtection' in currentScreenComponent && 'setRepoInfo' in currentScreenComponent) {
            const editor = currentScreenComponent as ProtectionEditorWithMethods
            editor.setProtection(protection)
            if (state.selectedRepos[0]) {
              editor.setRepoInfo(state.selectedRepos[0].owner.login, state.selectedRepos[0].name)
            }
          }
        }, 50)
      },
      () => {
        if (state.org) {
          showRepoSelector()
        } else {
          showOrgSelector()
        }
      }
    ) as TemplateManagerWithRefresh
    
    mainContent.add(container)
    currentScreenComponent = container
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
          const results = await applyProtectionToMultiple(targets, state.proposedProtection)
          state.results = results
          hideLoading()
          
          container.setResults(results)
        } catch (err) {
          hideLoading()
          showError(err instanceof Error ? err.message : 'Failed to apply protection')
        }
      },
      () => showEditor()
    ) as PreviewPaneWithMethods
    
    container.setDiff(state.currentProtection, state.proposedProtection)
    
    mainContent.add(container)
    currentScreenComponent = container
  }
  
  renderer.keyInput.on('keypress', async (key: { name: string; ctrl: boolean }) => {
    if (key.ctrl && key.name === 's' && state.screen === 'editor') {
      // Save current protection as template
      if (state.proposedProtection) {
        const name = `template-${Date.now()}`
        await saveTemplate(name, state.proposedProtection, 'Saved from editor')
        updateFooter(`Saved as template: ${name}`)
      }
    } else if (key.ctrl && key.name === 't') {
      showTemplates()
    }
  })
  
  // Handle --local flag
  if (localMode) {
    showLoading('Detecting local repository...')
    const localRepo = await detectLocalRepo()
    
    if (localRepo) {
      state.org = { login: localRepo.owner } as Organization
      state.selectedRepos = [{ 
        name: localRepo.repo, 
        full_name: `${localRepo.owner}/${localRepo.repo}`,
        owner: { login: localRepo.owner },
      } as Repository]
      
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
