import { api } from '@/lib/api/client'
import type { OAuthProvider, OAuthProviderOption } from './types'

export const oauthProviders: OAuthProviderOption[] = [
  { id: 'github', label: 'GitHub' },
  { id: 'google', label: 'Google', hint: 'Gmail' },
]

/**
 * URL that starts the OAuth flow on the API. It is a full-page redirect
 * (not an XHR), since the provider's consent screen must load in the browser.
 */
export function getOAuthLoginUrl(provider: OAuthProvider, baseURL = api.defaults.baseURL ?? '') {
  return `${baseURL.replace(/\/+$/, '')}/auth/${provider}`
}
