import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentLinkButton } from './PaymentLinkButton'

describe('PaymentLinkButton', () => {
  it('opens the link in a new tab, without access to this page', () => {
    render(<PaymentLinkButton href="https://www.banco.com.br/boleto/1" title="Conta de luz" />)

    const link = screen.getByRole('link', { name: 'Abrir link de pagamento: Conta de luz' })
    expect(link).toHaveAttribute('href', 'https://www.banco.com.br/boleto/1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAttribute('title', 'Pagar em banco.com.br')
  })
})
