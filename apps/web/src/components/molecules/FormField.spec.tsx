import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { FormField } from './FormField'

describe('FormField', () => {
  it('associates the label with the input and accepts typing', async () => {
    render(<FormField label="E-mail" type="email" />)

    const input = screen.getByLabelText('E-mail')
    await userEvent.type(input, 'ana@example.com')

    expect(input).toHaveValue('ana@example.com')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('shows the error and marks the input invalid', () => {
    render(<FormField label="E-mail" error="E-mail inválido" description="Seu e-mail" />)

    const input = screen.getByLabelText('E-mail')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('E-mail inválido')
    expect(input).toHaveAccessibleDescription('Seu e-mail E-mail inválido')
  })
})
