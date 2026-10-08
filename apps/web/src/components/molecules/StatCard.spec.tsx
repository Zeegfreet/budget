import { render, screen, within } from '@testing-library/react'
import { WalletIcon } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { StatCard } from './StatCard'

describe('StatCard', () => {
  it('shows the title, formatted amount and description in a named region', () => {
    render(<StatCard title="Saldo do mês" cents={-150000} description="Receitas − despesas" icon={WalletIcon} signed />)

    const card = screen.getByRole('region', { name: 'Saldo do mês' })
    const amount = within(card).getByText(/1\.500,00/)
    expect(amount.textContent).toMatch(/^-R\$\s1\.500,00$/)
    expect(amount).toHaveClass('text-destructive')
    expect(within(card).getByText('Receitas − despesas')).toBeInTheDocument()
  })

  it('renders an action in place of the icon', () => {
    render(<StatCard title="Saldo" cents={0} icon={WalletIcon} action={<button type="button">Ajustar</button>} />)

    expect(screen.getByRole('button', { name: 'Ajustar' })).toBeInTheDocument()
  })
})
