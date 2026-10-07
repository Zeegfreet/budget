import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OAuthButton } from './OAuthButton'

describe('OAuthButton', () => {
  it('renders a link to the provider OAuth URL with its brand icon', () => {
    const { container } = render(<OAuthButton provider={{ id: 'github', label: 'GitHub' }} />)

    const link = screen.getByRole('link', { name: 'Continuar com GitHub' })
    expect(link).toHaveAttribute('href', '/api/auth/github')
    expect(container.querySelector('svg[data-provider="github"]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('exposes the provider hint to assistive tech', () => {
    render(<OAuthButton provider={{ id: 'google', label: 'Google', hint: 'Gmail' }} />)

    expect(screen.getByRole('link', { name: 'Continuar com Google (Gmail)' })).toHaveAttribute(
      'title',
      'Gmail',
    )
  })
})
