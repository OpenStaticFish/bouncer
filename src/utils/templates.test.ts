import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createDefaultTemplates,
  deleteTemplate,
  listTemplates,
  loadTemplate,
  saveTemplate,
} from './templates'

const TEST_DIR = join(tmpdir(), `repoprotector-test-${Date.now()}`)

describe('templates', () => {
  beforeEach(async () => {
    process.env.REPOPROTECTOR_CONFIG_DIR = TEST_DIR
    await mkdir(join(TEST_DIR, 'templates'), { recursive: true })
  })

  afterEach(async () => {
    delete process.env.REPOPROTECTOR_CONFIG_DIR
    await rm(TEST_DIR, { recursive: true, force: true })
  })

  describe('createDefaultTemplates', () => {
    test('returns three default templates', () => {
      const templates = createDefaultTemplates()
      expect(templates.length).toBe(3)
    })

    test('basic template has required fields', () => {
      const [basic] = createDefaultTemplates()
      expect(
        basic?.required_pull_request_reviews?.required_approving_review_count,
      ).toBe(1)
      expect(basic?.enforce_admins).toBe(false)
      expect(basic?.required_status_checks).toBeNull()
    })

    test('strict template enforces admins', () => {
      const [, strict] = createDefaultTemplates()
      expect(strict?.enforce_admins).toBe(true)
      expect(
        strict?.required_pull_request_reviews?.required_approving_review_count,
      ).toBe(2)
    })

    test('unprotected template allows force pushes', () => {
      const [, , unprotected] = createDefaultTemplates()
      expect(unprotected?.allow_force_pushes).toBe(true)
      expect(unprotected?.required_pull_request_reviews).toBeNull()
    })
  })

  describe('saveTemplate and loadTemplate', () => {
    test('saves and loads a template', async () => {
      const protection = {
        enforce_admins: true,
        allow_force_pushes: false,
      }

      const saved = await saveTemplate(
        'test-template',
        protection,
        'Test description',
      )
      expect(saved.name).toBe('test-template')
      expect(saved.description).toBe('Test description')
      expect(saved.protection.enforce_admins).toBe(true)

      const loaded = await loadTemplate('test-template')
      expect(loaded).not.toBeNull()
      expect(loaded?.name).toBe('test-template')
      expect(loaded?.protection.enforce_admins).toBe(true)
    })

    test('loadTemplate returns null for non-existent template', async () => {
      const result = await loadTemplate('non-existent')
      expect(result).toBeNull()
    })

    test('preserves created_at on update', async () => {
      const protection = { enforce_admins: false }
      const first = await saveTemplate('update-test', protection)

      await new Promise((r) => setTimeout(r, 10))

      const updated = await saveTemplate('update-test', {
        enforce_admins: true,
      })
      expect(updated.created_at).toBe(first.created_at)
      expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
        new Date(first.updated_at).getTime(),
      )
    })
  })

  describe('listTemplates', () => {
    test('returns empty array when no templates', async () => {
      const templates = await listTemplates()
      expect(templates).toEqual([])
    })

    test('returns templates sorted by name', async () => {
      await saveTemplate('zebra', { enforce_admins: true })
      await saveTemplate('alpha', { enforce_admins: false })
      await saveTemplate('middle', { enforce_admins: true })

      const templates = await listTemplates()
      expect(templates.map((t) => t.name)).toEqual(['alpha', 'middle', 'zebra'])
    })
  })

  describe('deleteTemplate', () => {
    test('deletes existing template', async () => {
      await saveTemplate('to-delete', { enforce_admins: true })

      const deleted = await deleteTemplate('to-delete')
      expect(deleted).toBe(true)

      const loaded = await loadTemplate('to-delete')
      expect(loaded).toBeNull()
    })

    test('returns false for non-existent template', async () => {
      const result = await deleteTemplate('non-existent')
      expect(result).toBe(false)
    })
  })
})
