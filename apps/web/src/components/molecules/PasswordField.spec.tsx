import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PasswordField } from './PasswordField'

describe('PasswordField', () => {
  it('hides the password by default and toggles its visibility', async () => {
    render(<PasswordField label="Senha" />)

    const input = screen.getByLabelText('Senha')
    const toggle = screen.getByRole('button', { name: 'Mostrar senha' })
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('autocomplete', 'current-password')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(toggle)
    expect(input).toHaveAttribute('type', 'text')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(toggle)
    expect(input).toHaveAttribute('type', 'password')
  })

  it('shows the error and marks the input invalid', () => {
    render(<PasswordField label="Senha" error="Informe a senha" />)

    const input = screen.getByLabelText('Senha')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Informe a senha')
  })
})
