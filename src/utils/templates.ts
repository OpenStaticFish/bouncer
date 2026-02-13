import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import type { BranchProtectionInput, Template } from '../types'

function getConfigDir(): string {
  return (
    process.env.REPOPROTECTOR_CONFIG_DIR ??
    join(homedir(), '.config', 'repoprotector')
  )
}

function getTemplatesDir(): string {
  return join(getConfigDir(), 'templates')
}

async function ensureConfigDir(): Promise<void> {
  await mkdir(getTemplatesDir(), { recursive: true })
}

export async function listTemplates(): Promise<Template[]> {
  await ensureConfigDir()

  const files = await readdir(getTemplatesDir())
  const templates: Template[] = []

  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const content = await readFile(join(getTemplatesDir(), file), 'utf-8')
        const template = JSON.parse(content) as Template
        templates.push(template)
      } catch {
        // Skip invalid template files
      }
    }
  }

  return templates.sort((a, b) => a.name.localeCompare(b.name))
}

export async function loadTemplate(name: string): Promise<Template | null> {
  await ensureConfigDir()

  try {
    const content = await readFile(
      join(getTemplatesDir(), `${name}.json`),
      'utf-8',
    )
    return JSON.parse(content) as Template
  } catch {
    return null
  }
}

export async function saveTemplate(
  name: string,
  protection: BranchProtectionInput,
  description?: string,
): Promise<Template> {
  await ensureConfigDir()

  const existing = await loadTemplate(name)
  const now = new Date().toISOString()

  const template: Template = {
    name,
    description: description || existing?.description,
    created_at: existing?.created_at || now,
    updated_at: now,
    protection,
  }

  await writeFile(
    join(getTemplatesDir(), `${name}.json`),
    JSON.stringify(template, null, 2),
  )

  return template
}

export async function deleteTemplate(name: string): Promise<boolean> {
  await ensureConfigDir()

  try {
    await unlink(join(getTemplatesDir(), `${name}.json`))
    return true
  } catch {
    return false
  }
}

export function createDefaultTemplates(): BranchProtectionInput[] {
  return [
    {
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
      required_conversation_resolution: true,
    },
    {
      required_pull_request_reviews: {
        dismiss_stale_reviews: true,
        require_code_owner_reviews: true,
        required_approving_review_count: 2,
      },
      required_status_checks: {
        strict: true,
        contexts: [],
      },
      enforce_admins: true,
      required_linear_history: true,
      allow_force_pushes: false,
      allow_deletions: false,
      required_conversation_resolution: true,
    },
    {
      required_pull_request_reviews: null,
      required_status_checks: null,
      enforce_admins: false,
      required_linear_history: false,
      allow_force_pushes: true,
      allow_deletions: false,
      required_conversation_resolution: false,
    },
  ]
}

export async function initializeDefaultTemplates(): Promise<void> {
  const defaults = createDefaultTemplates()
  const names = ['basic', 'strict', 'unprotected']
  const descriptions = [
    'Basic protection: requires 1 PR approval',
    'Strict protection: 2 approvals, code owners, status checks, admin enforcement',
    'Unprotected: allows force pushes, no PR required',
  ]

  for (let i = 0; i < defaults.length; i++) {
    const name = names[i]!
    const description = descriptions[i]!
    const protection = defaults[i]!
    const existing = await loadTemplate(name)
    if (!existing) {
      await saveTemplate(name, protection, description)
    }
  }
}
