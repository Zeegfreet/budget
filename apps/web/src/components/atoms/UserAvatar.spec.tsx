import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UserAvatar } from './UserAvatar'

describe('UserAvatar', () => {
  it('shows the initials of the first and last name', () => {
    render(<UserAvatar name="Ana Maria Souza" />)
    expect(screen.getByText('AS')).toBeInTheDocument()
  })

  it('is hidden from assistive tech', () => {
    const { container } = render(<UserAvatar name="Ana" />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })
})
