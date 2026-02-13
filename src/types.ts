export interface Organization {
  login: string
  id: number
  avatar_url: string
  description: string | null
}

export interface Repository {
  id: number
  name: string
  full_name: string
  owner: { login: string }
  private: boolean
  default_branch: string
  permissions?: {
    admin: boolean
    maintain: boolean
    push: boolean
    pull: boolean
  }
}

export interface Branch {
  name: string
  protected: boolean
  protection_url?: string
}

export interface DismissalRestrictions {
  users: string[]
  teams: string[]
  apps?: string[]
}

export interface RequiredPullRequestReviews {
  dismiss_stale_reviews: boolean
  require_code_owner_reviews: boolean
  required_approving_review_count: number
  dismissal_restrictions?: DismissalRestrictions | null
  bypass_pull_request_allowances?: {
    users: string[]
    teams: string[]
    apps: string[]
  } | null
}

export interface RequiredStatusChecks {
  strict: boolean
  contexts: string[]
  checks?: { context: string; app_id: number | null }[]
}

export interface BranchProtectionRestrictions {
  users: string[]
  teams: string[]
  apps: string[]
}

export interface BranchProtection {
  url?: string
  required_pull_request_reviews: RequiredPullRequestReviews | null
  required_status_checks: RequiredStatusChecks | null
  enforce_admins: boolean
  required_linear_history: boolean
  allow_force_pushes: boolean
  allow_deletions: boolean
  block_creations: boolean
  required_conversation_resolution: boolean
  restrictions: BranchProtectionRestrictions | null
  required_signatures?: { enabled: boolean } | null
  lock_branch?: boolean
}

export interface BranchProtectionInput {
  required_pull_request_reviews?: RequiredPullRequestReviews | null
  required_status_checks?: RequiredStatusChecks | null
  enforce_admins?: boolean
  required_linear_history?: boolean
  allow_force_pushes?: boolean
  allow_deletions?: boolean
  block_creations?: boolean
  required_conversation_resolution?: boolean
  restrictions?: BranchProtectionRestrictions | null
}

export interface Template {
  name: string
  description?: string
  created_at: string
  updated_at: string
  protection: BranchProtectionInput
}

export interface AppSelection {
  org: Organization | null
  repos: Repository[]
  branches: string[]
}

export interface ApplyResult {
  repo: Repository
  branch: string
  success: boolean
  error?: string
}

export interface AppState {
  currentScreen:
    | 'orgs'
    | 'repos'
    | 'branches'
    | 'editor'
    | 'templates'
    | 'preview'
  selectedOrg: Organization | null
  selectedRepos: Repository[]
  selectedBranch: string | null
  currentProtection: BranchProtection | null
  templates: Template[]
  applyResults: ApplyResult[]
  isLoading: boolean
  error: string | null
}
