import { describe, expect, it } from 'vitest'
import { getOAuthLoginUrl, oauthProviders } from './oauth'

describe('getOAuthLoginUrl', () => {
  it('builds the URL from the API client baseURL', () => {
    expect(getOAuthLoginUrl('github')).toBe('/api/auth/oauth/github')
  })

  it('supports an absolute baseURL and strips trailing slashes', () => {
    expect(getOAuthLoginUrl('google', { baseURL: 'https://api.budget.app/' })).toBe(
      'https://api.budget.app/auth/oauth/google',
    )
  })

  it('passes on where to go after signing in', () => {
    expect(getOAuthLoginUrl('github', { redirect: '/extrato?month=2026-10' })).toBe(
      '/api/auth/oauth/github?redirect=%2Fextrato%3Fmonth%3D2026-10',
    )
  })

  it('lists only GitHub and Google as providers', () => {
    expect(oauthProviders.map((p) => p.id)).toEqual(['github', 'google'])
  })
})
