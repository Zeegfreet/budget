import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MoneyText } from './MoneyText'

describe('MoneyText', () => {
  it('renders formatted cents', () => {
    render(<MoneyText cents={2500} />)
    expect(screen.getByText(/R\$\s25,00/)).toBeInTheDocument()
  })

  it('colors amounts only when signed', () => {
    const { rerender } = render(<MoneyText cents={-100} />)
    expect(screen.getByText(/1,00/)).not.toHaveClass('text-destructive')

    rerender(<MoneyText cents={-100} signed />)
    expect(screen.getByText(/1,00/)).toHaveClass('text-destructive')

    rerender(<MoneyText cents={100} signed />)
    expect(screen.getByText(/1,00/)).toHaveClass('text-emerald-600')
  })
})
