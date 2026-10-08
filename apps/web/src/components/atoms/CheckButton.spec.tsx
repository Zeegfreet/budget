import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CheckButton } from './CheckButton'

describe('CheckButton', () => {
  it('toggles its pressed state on click', async () => {
    const onPressedChange = vi.fn()
    const { rerender } = render(<CheckButton pressed={false} onPressedChange={onPressedChange} aria-label="Recebido" />)

    const button = screen.getByRole('button', { name: 'Recebido' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(button)
    expect(onPressedChange).toHaveBeenLastCalledWith(true)

    rerender(<CheckButton pressed onPressedChange={onPressedChange} aria-label="Recebido" />)
    expect(button).toHaveAttribute('aria-pressed', 'true')
    // Solid green once pressed
    expect(button.firstElementChild).toHaveClass('bg-success')
    await userEvent.click(button)
    expect(onPressedChange).toHaveBeenLastCalledWith(false)
  })

  it('only shows the state when disabled', async () => {
    const onPressedChange = vi.fn()
    render(<CheckButton pressed disabled onPressedChange={onPressedChange} aria-label="Recebido" />)

    const button = screen.getByRole('button', { name: 'Recebido' })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onPressedChange).not.toHaveBeenCalled()
  })
})
