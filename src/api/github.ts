import type {
  Organization,
  Repository,
  Branch,
  BranchProtection,
  BranchProtectionInput,
  ApplyResult,
} from '../types'

async function ghApi(
  endpoint: string,
  method: 'GET' | 'PUT' | 'DELETE' = 'GET',
  body?: object
): Promise<unknown> {
  const args = ['api', endpoint]
  
  if (method !== 'GET') {
    args.push('-X', method)
  }
  
  if (body) {
    args.push('--input', '-')
  }
  
  const proc = Bun.spawn(['gh', ...args], {
    stdout: 'pipe',
    stdin: body ? 'pipe' : undefined,
    stderr: 'pipe',
  })
  
  if (body) {
    proc.stdin!.write(JSON.stringify(body))
    proc.stdin!.end()
  }
  
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
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
  return (await ghApi('/user/repos?per_page=100&affiliation=owner')) as Repository[]
}

export async function getRepoBranches(owner: string, repo: string): Promise<Branch[]> {
  return (await ghApi(`/repos/${owner}/${repo}/branches?per_page=100`)) as Branch[]
}

export async function getBranchProtection(
  owner: string,
  repo: string,
  branch: string
): Promise<BranchProtection | null> {
  try {
    return (await ghApi(
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`
    )) as BranchProtection
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
  protection: BranchProtectionInput
): Promise<BranchProtection> {
  return (await ghApi(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`,
    'PUT',
    protection
  )) as BranchProtection
}

export async function deleteBranchProtection(
  owner: string,
  repo: string,
  branch: string
): Promise<void> {
  await ghApi(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`,
    'DELETE'
  )
}

export async function applyProtectionToMultiple(
  targets: { owner: string; repo: string; branch: string }[],
  protection: BranchProtectionInput
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = []
  
  for (const target of targets) {
    try {
      await updateBranchProtection(target.owner, target.repo, target.branch, protection)
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

export async function detectLocalRepo(): Promise<{ owner: string; repo: string } | null> {
  try {
    const proc = Bun.spawn(['gh', 'repo', 'view', '--json', 'owner,name'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    
    const stdout = await new Response(proc.stdout).text()
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

export async function getRepoWorkflows(owner: string, repo: string): Promise<Workflow[]> {
  try {
    const result = await ghApi(`/repos/${owner}/${repo}/actions/workflows?per_page=100`)
    const data = result as { workflows: Workflow[] } | null
    return data?.workflows ?? []
  } catch {
    return []
  }
}
