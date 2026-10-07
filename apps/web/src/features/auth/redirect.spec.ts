import { describe, expect, it } from 'vitest'
import { safeRedirect } from './redirect'

describe('safeRedirect', () => {
  it.each(['/', '/groups/1', '/expenses?month=2026-10'])('keeps internal path %s', (path) => {
    expect(safeRedirect(path)).toBe(path)
  })

  it.each([
    undefined,
    '',
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    'javascript:alert(1)',
    'groups',
  ])('rejects %s', (path) => {
    expect(safeRedirect(path)).toBe('/')
  })
})
