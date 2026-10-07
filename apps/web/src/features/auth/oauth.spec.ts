import { describe, expect, it } from 'vitest'
import { getOAuthLoginUrl, oauthProviders } from './oauth'

describe('getOAuthLoginUrl', () => {
  it('builds the URL from the API client baseURL', () => {
    expect(getOAuthLoginUrl('github')).toBe('/api/auth/github')
  })

  it('supports an absolute baseURL and strips trailing slashes', () => {
    expect(getOAuthLoginUrl('google', 'https://api.budget.app/')).toBe(
      'https://api.budget.app/auth/google',
    )
  })

  it('lists only GitHub and Google as providers', () => {
    expect(oauthProviders.map((p) => p.id)).toEqual(['github', 'google'])
  })
})
