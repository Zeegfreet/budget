import { api } from '@/lib/api/client'
import type { OAuthProvider, OAuthProviderOption } from './types'

export const oauthProviders: OAuthProviderOption[] = [
  { id: 'github', label: 'GitHub' },
  { id: 'google', label: 'Google', hint: 'Gmail' },
]

interface OAuthLoginUrlOptions {
  /** Same-app path to open after signing in (the API drops anything else) */
  redirect?: string
  baseURL?: string
}

/**
 * URL that starts the OAuth flow on the API. It is a full-page redirect
 * (not an XHR), since the provider's consent screen must load in the browser.
 */
export function getOAuthLoginUrl(
  provider: OAuthProvider,
  { redirect, baseURL = api.defaults.baseURL ?? '' }: OAuthLoginUrlOptions = {},
) {
  const url = `${baseURL.replace(/\/+$/, '')}/auth/oauth/${provider}`
  return redirect ? `${url}?${new URLSearchParams({ redirect })}` : url
}
