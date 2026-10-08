import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { MoneyInput } from './MoneyInput'

function Harness({ allowNegative }: { allowNegative?: boolean }) {
  const [value, setValue] = useState('')
  return <MoneyInput aria-label="Valor" value={value} onValueChange={setValue} allowNegative={allowNegative} />
}

describe('MoneyInput', () => {
  it('uses the decimal keyboard and accepts valid amounts', async () => {
    render(<Harness />)
    const input = screen.getByRole('textbox', { name: 'Valor' })
    expect(input).toHaveAttribute('inputmode', 'decimal')

    await userEvent.type(input, '1.800,50')
    expect(input).toHaveValue('1.800,50')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('flags text that is not an amount', async () => {
    render(<Harness />)
    const input = screen.getByRole('textbox', { name: 'Valor' })

    await userEvent.type(input, '12abc')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('flags negative amounts unless allowed', async () => {
    const { unmount } = render(<Harness />)
    await userEvent.type(screen.getByRole('textbox'), '-10')
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    unmount()

    render(<Harness allowNegative />)
    await userEvent.type(screen.getByRole('textbox'), '-10')
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid')
  })
})
