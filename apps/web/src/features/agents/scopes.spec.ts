import { describe, expect, it } from 'vitest'
import { accessLabel } from './scopes'

describe('accessLabel', () => {
  it('says whether the agent can change data', () => {
    expect(accessLabel(['budget:read', 'budget:write'])).toBe('Leitura e escrita')
    expect(accessLabel(['budget:read'])).toBe('Somente leitura')
  })
})
