import { describe, expect, test } from 'bun:test'

function extractEnabled<T>(
  value: T | { enabled: boolean } | null | undefined,
): T | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'object' && value !== null && 'enabled' in value) {
    return (value as { enabled: boolean }).enabled
  }
  return value as T
}

function transformProtectionResponse(raw: Record<string, unknown>) {
  return {
    url: raw.url as string | undefined,
    required_pull_request_reviews: raw.required_pull_request_reviews as unknown,
    required_status_checks: raw.required_status_checks as unknown,
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
    restrictions: raw.restrictions as unknown,
    required_signatures: raw.required_signatures
      ? { enabled: extractEnabled(raw.required_signatures) as boolean }
      : null,
    lock_branch: extractEnabled(raw.lock_branch) as boolean | undefined,
  }
}

describe('extractEnabled', () => {
  test('returns null for null input', () => {
    expect(extractEnabled(null)).toBeNull()
  })

  test('returns null for undefined input', () => {
    expect(extractEnabled(undefined)).toBeNull()
  })

  test('extracts boolean from { enabled: true }', () => {
    expect(extractEnabled({ enabled: true })).toBe(true)
  })

  test('extracts boolean from { enabled: false }', () => {
    expect(extractEnabled({ enabled: false })).toBe(false)
  })

  test('returns primitive boolean as-is', () => {
    expect(extractEnabled(true)).toBe(true)
    expect(extractEnabled(false)).toBe(false)
  })

  test('returns other values as-is', () => {
    expect(extractEnabled('string')).toBe('string')
    expect(extractEnabled(42)).toBe(42)
  })
})

describe('transformProtectionResponse', () => {
  test('transforms GitHub API response format', () => {
    const raw = {
      url: 'https://api.github.com/repos/owner/repo/branches/main/protection',
      enforce_admins: { enabled: true, url: '...' },
      required_linear_history: { enabled: false },
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false },
      block_creations: { enabled: false },
      required_conversation_resolution: { enabled: true },
      required_pull_request_reviews: {
        dismiss_stale_reviews: true,
        required_approving_review_count: 2,
      },
      required_status_checks: null,
      restrictions: null,
    }

    const result = transformProtectionResponse(raw)

    expect(result.enforce_admins).toBe(true)
    expect(result.required_linear_history).toBe(false)
    expect(result.allow_force_pushes).toBe(false)
    expect(result.allow_deletions).toBe(false)
    expect(result.block_creations).toBe(false)
    expect(result.required_conversation_resolution).toBe(true)
  })

  test('handles missing optional fields', () => {
    const raw = {
      enforce_admins: { enabled: false },
    }

    const result = transformProtectionResponse(raw)

    expect(result.enforce_admins).toBe(false)
    expect(result.required_pull_request_reviews).toBeUndefined()
    expect(result.required_status_checks).toBeUndefined()
  })

  test('handles required_signatures nested object', () => {
    const raw = {
      required_signatures: { enabled: true, url: '...' },
    }

    const result = transformProtectionResponse(raw)

    expect(result.required_signatures).toEqual({ enabled: true })
  })
})

describe('updateBranchProtection input sanitization', () => {
  test('converts undefined to appropriate defaults', () => {
    const protection: Record<string, unknown> = {}

    const cleanInput: Record<string, unknown> = {
      required_pull_request_reviews:
        protection.required_pull_request_reviews ?? null,
      required_status_checks: protection.required_status_checks ?? null,
      enforce_admins: protection.enforce_admins ?? false,
      required_linear_history: protection.required_linear_history ?? false,
      allow_force_pushes: protection.allow_force_pushes ?? false,
      allow_deletions: protection.allow_deletions ?? false,
      block_creations: protection.block_creations ?? false,
      required_conversation_resolution:
        protection.required_conversation_resolution ?? true,
      restrictions: protection.restrictions ?? null,
    }

    expect(cleanInput.required_pull_request_reviews).toBeNull()
    expect(cleanInput.required_status_checks).toBeNull()
    expect(cleanInput.enforce_admins).toBe(false)
    expect(cleanInput.allow_force_pushes).toBe(false)
    expect(cleanInput.required_conversation_resolution).toBe(true)
    expect(cleanInput.restrictions).toBeNull()
  })

  test('preserves explicit values', () => {
    const protection: Record<string, unknown> = {
      enforce_admins: true,
      allow_force_pushes: true,
      required_pull_request_reviews: {
        required_approving_review_count: 2,
      },
    }

    const cleanInput: Record<string, unknown> = {
      required_pull_request_reviews:
        protection.required_pull_request_reviews ?? null,
      required_status_checks: protection.required_status_checks ?? null,
      enforce_admins: protection.enforce_admins ?? false,
      required_linear_history: protection.required_linear_history ?? false,
      allow_force_pushes: protection.allow_force_pushes ?? false,
      allow_deletions: protection.allow_deletions ?? false,
      block_creations: protection.block_creations ?? false,
      required_conversation_resolution:
        protection.required_conversation_resolution ?? true,
      restrictions: protection.restrictions ?? null,
    }

    expect(cleanInput.enforce_admins).toBe(true)
    expect(cleanInput.allow_force_pushes).toBe(true)
    expect(cleanInput.required_pull_request_reviews).toEqual({
      required_approving_review_count: 2,
    })
  })
})
