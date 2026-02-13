import type {
  ApplyResult,
  Branch,
  BranchProtection,
  BranchProtectionInput,
  Organization,
  Repository,
} from '../types'

async function ghApi(
  endpoint: string,
  method: 'GET' | 'PUT' | 'DELETE' = 'GET',
  body?: object,
): Promise<unknown> {
  const args = ['api', endpoint]

  if (method !== 'GET') {
    args.push('-X', method)
  }

  if (body) {
    args.push('--input', '-')
  }

  let proc: Bun.Subprocess

  if (body) {
    proc = Bun.spawn(['gh', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'pipe',
    })
    const bodyStr = JSON.stringify(body)
    const encoder = new TextEncoder()
    const stdin = proc.stdin! as unknown as {
      write: (data: Uint8Array) => Promise<void>
      close: () => void
    }
    await stdin.write(encoder.encode(bodyStr))
    stdin.close()
  } else {
    proc = Bun.spawn(['gh', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
  }

  const stdout = await new Response(proc.stdout as ReadableStream).text()
  const stderr = await new Response(proc.stderr as ReadableStream).text()
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    throw new Error(stderr || `gh api failed with exit code ${exitCode}`)
  }

  if (!stdout.trim()) {
    return null
  }

  return JSON.parse(stdout)
}

export async function getOrganizations(): Promise<Organization[]> {
  return (await ghApi('/user/orgs')) as Organization[]
}

export async function getOrgRepos(org: string): Promise<Repository[]> {
  return (await ghApi(`/orgs/${org}/repos?per_page=100`)) as Repository[]
}

export async function getUserRepos(): Promise<Repository[]> {
  return (await ghApi(
    '/user/repos?per_page=100&affiliation=owner',
  )) as Repository[]
}

export async function getRepoBranches(
  owner: string,
  repo: string,
): Promise<Branch[]> {
  return (await ghApi(
    `/repos/${owner}/${repo}/branches?per_page=100`,
  )) as Branch[]
}

function extractEnabled<T>(
  value: T | { enabled: boolean } | null | undefined,
): T | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'object' && value !== null && 'enabled' in value) {
    return (value as { enabled: boolean }).enabled
  }
  return value as T
}

function transformProtectionResponse(
  raw: Record<string, unknown>,
): BranchProtection {
  return {
    url: raw.url as string | undefined,
    required_pull_request_reviews:
      raw.required_pull_request_reviews as BranchProtection['required_pull_request_reviews'],
    required_status_checks:
      raw.required_status_checks as BranchProtection['required_status_checks'],
    enforce_admins: extractEnabled(raw.enforce_admins) as boolean,
    required_linear_history: extractEnabled(
      raw.required_linear_history,
    ) as boolean,
    allow_force_pushes: extractEnabled(raw.allow_force_pushes) as boolean,
    allow_deletions: extractEnabled(raw.allow_deletions) as boolean,
    block_creations: extractEnabled(raw.block_creations) as boolean,
    required_conversation_resolution: extractEnabled(
      raw.required_conversation_resolution,
    ) as boolean,
    restrictions: raw.restrictions as BranchProtection['restrictions'],
    required_signatures: raw.required_signatures
      ? { enabled: extractEnabled(raw.required_signatures) as boolean }
      : null,
    lock_branch: extractEnabled(raw.lock_branch) as boolean | undefined,
  }
}

export async function getBranchProtection(
  owner: string,
  repo: string,
  branch: string,
): Promise<BranchProtection | null> {
  try {
    const raw = await ghApi(
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`,
    )
    return transformProtectionResponse(raw as Record<string, unknown>)
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    if (msg.includes('404') || msg.includes('Not Found')) {
      return null
    }
    throw error
  }
}

export async function updateBranchProtection(
  owner: string,
  repo: string,
  branch: string,
  protection: BranchProtectionInput,
): Promise<BranchProtection> {
  let cleanStatusChecks = null
  if (protection.required_status_checks) {
    const rsc = protection.required_status_checks
    cleanStatusChecks = {
      strict: rsc.strict ?? false,
      contexts: rsc.contexts ?? [],
    }
  }

  let cleanPrReviews = null
  if (protection.required_pull_request_reviews) {
    const rpr = protection.required_pull_request_reviews
    cleanPrReviews = {
      dismiss_stale_reviews: rpr.dismiss_stale_reviews ?? false,
      require_code_owner_reviews: rpr.require_code_owner_reviews ?? false,
      required_approving_review_count: rpr.required_approving_review_count ?? 1,
    }
  }

  const cleanInput: Record<string, unknown> = {
    required_pull_request_reviews: cleanPrReviews,
    required_status_checks: cleanStatusChecks,
    enforce_admins: protection.enforce_admins ?? false,
    required_linear_history: protection.required_linear_history ?? false,
    allow_force_pushes: protection.allow_force_pushes ?? false,
    allow_deletions: protection.allow_deletions ?? false,
    block_creations: protection.block_creations ?? false,
    required_conversation_resolution:
      protection.required_conversation_resolution ?? true,
    restrictions: protection.restrictions ?? null,
  }

  return (await ghApi(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`,
    'PUT',
    cleanInput,
  )) as BranchProtection
}

export async function deleteBranchProtection(
  owner: string,
  repo: string,
  branch: string,
): Promise<void> {
  await ghApi(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`,
    'DELETE',
  )
}

export async function applyProtectionToMultiple(
  targets: { owner: string; repo: string; branch: string }[],
  protection: BranchProtectionInput,
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = []

  for (const target of targets) {
    try {
      await updateBranchProtection(
        target.owner,
        target.repo,
        target.branch,
        protection,
      )
      results.push({
        repo: {
          name: target.repo,
          full_name: `${target.owner}/${target.repo}`,
          owner: { login: target.owner },
        } as Repository,
        branch: target.branch,
        success: true,
      })
    } catch (error) {
      results.push({
        repo: {
          name: target.repo,
          full_name: `${target.owner}/${target.repo}`,
          owner: { login: target.owner },
        } as Repository,
        branch: target.branch,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return results
}

export async function detectLocalRepo(): Promise<{
  owner: string
  repo: string
} | null> {
  try {
    const proc = Bun.spawn(['gh', 'repo', 'view', '--json', 'owner,name'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout as ReadableStream).text()
    const exitCode = await proc.exited

    if (exitCode !== 0 || !stdout.trim()) {
      return null
    }

    const data = JSON.parse(stdout)
    return { owner: data.owner.login, repo: data.name }
  } catch {
    return null
  }
}

export interface Workflow {
  id: number
  name: string
  path: string
  state: string
}

export async function getRepoWorkflows(
  owner: string,
  repo: string,
): Promise<Workflow[]> {
  try {
    const result = await ghApi(
      `/repos/${owner}/${repo}/actions/workflows?per_page=100`,
    )
    const data = result as { workflows: Workflow[] } | null
    return data?.workflows ?? []
  } catch {
    return []
  }
}

export interface CheckJob {
  name: string
  workflowName: string
}

export async function getAvailableChecks(
  owner: string,
  repo: string,
): Promise<CheckJob[]> {
  try {
    const result = await ghApi(
      `/repos/${owner}/${repo}/actions/runs?per_page=20&status=success`,
    )
    const runsData = result as {
      workflow_runs: Array<{ id: number; name: string }>
    } | null
    const runs = runsData?.workflow_runs ?? []

    const checkSet = new Map<string, CheckJob>()

    for (const run of runs) {
      try {
        const jobsResult = await ghApi(
          `/repos/${owner}/${repo}/actions/runs/${run.id}/jobs?per_page=50`,
        )
        const jobsData = jobsResult as { jobs: Array<{ name: string }> } | null
        const jobs = jobsData?.jobs ?? []

        for (const job of jobs) {
          if (!checkSet.has(job.name)) {
            checkSet.set(job.name, {
              name: job.name,
              workflowName: run.name,
            })
          }
        }
      } catch {}
    }

    return Array.from(checkSet.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  } catch {
    return []
  }
}
