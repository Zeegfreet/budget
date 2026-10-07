import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OAuthOptions } from './OAuthOptions'

describe('OAuthOptions', () => {
  it('lists a sign-in link per provider after the divider', () => {
    render(<OAuthOptions />)

    expect(screen.getByText('ou')).toBeInTheDocument()
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/api/auth/github',
      '/api/auth/google',
    ])
  })
})
