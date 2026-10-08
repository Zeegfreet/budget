import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OAuthButton } from './OAuthButton'

describe('OAuthButton', () => {
  it('renders a link to the provider OAuth URL with its brand icon', () => {
    const { container } = render(<OAuthButton provider={{ id: 'github', label: 'GitHub' }} />)

    const link = screen.getByRole('link', { name: 'Continuar com GitHub' })
    expect(link).toHaveAttribute('href', '/api/auth/oauth/github')
    expect(container.querySelector('svg[data-provider="github"]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('carries where to go after signing in', () => {
    render(<OAuthButton provider={{ id: 'github', label: 'GitHub' }} redirect="/grupos" />)

    expect(screen.getByRole('link', { name: 'Continuar com GitHub' })).toHaveAttribute(
      'href',
      '/api/auth/oauth/github?redirect=%2Fgrupos',
    )
  })

  it('exposes the provider hint to assistive tech', () => {
    render(<OAuthButton provider={{ id: 'google', label: 'Google', hint: 'Gmail' }} />)

    expect(screen.getByRole('link', { name: 'Continuar com Google (Gmail)' })).toHaveAttribute(
      'title',
      'Gmail',
    )
  })
})
