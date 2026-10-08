import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import { fetchInvoice, fetchInvoiceHistory, payInvoice, unpayInvoice } from '@/features/payment-methods/api'
import { realizeTransaction } from '@/features/transactions/api'
import { ApiError } from '@/lib/api/client'
import { stubBudgetApi } from '@/test/budget'
import { card, makeInvoice, stubPaymentMethodsApi } from '@/test/payment-methods'
import { makeAuthUser } from '@/test/auth'
import { renderRoute } from '@/test/render'
import { categories, makeTransaction, stubTransactionsApi } from '@/test/transactions'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/budget/api')
vi.mock('@/features/transactions/api')
vi.mock('@/features/payment-methods/api')

const region = (name: string) => screen.getByRole('region', { name })
const summaryItem = (name: string) => within(region('Resumo da fatura')).getByRole('group', { name })

async function openInvoice(path = '/meios-de-pagamento/1') {
  const result = await renderRoute(path)
  await screen.findByRole('heading', { name: 'Cartão Americanas', level: 1 })
  return result
}

describe('Invoice route (/meios-de-pagamento/:id)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue(makeAuthUser())
    stubBudgetApi()
    stubTransactionsApi()
    stubPaymentMethodsApi()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the month’s invoice with its launches, group shares and history', async () => {
    await openInvoice()

    expect(fetchInvoice).toHaveBeenCalledWith(1, '2026-10')
    expect(screen.getByText('Cartão de crédito · Vence dia 12')).toBeInTheDocument()
    expect(summaryItem('Total da fatura')).toHaveTextContent('R$ 250,00')
    expect(summaryItem('Pago')).toHaveTextContent('R$ 50,00')
    expect(summaryItem('A pagar')).toHaveTextContent('R$ 200,00')
    expect(summaryItem('Vencimento')).toHaveTextContent('12/10')

    const items = within(region('Lançamentos da fatura')).getAllByRole('listitem')
    expect(items.map((li) => li.getAttribute('aria-label'))).toEqual(['Cinema', 'Mercado', 'Aluguel (República)'])
    // The method isn't repeated on each row
    expect(within(items[0]).queryByRole('link', { name: /Cartão Americanas/ })).not.toBeInTheDocument()
    expect(within(items[2]).getByText(/Pendente no grupo/)).toBeInTheDocument()
    expect(within(items[2]).getByRole('link', { name: /República/ })).toHaveAttribute(
      'href',
      '/grupos/7?month=2026-10&tab=lancamentos',
    )

    await waitFor(() => expect(fetchInvoiceHistory).toHaveBeenCalledWith(1, '2026-05', '2027-04'))
    const october = await within(region('Histórico')).findByRole('button', { name: 'Fatura de out/26' })
    expect(october).toHaveAttribute('aria-current', 'date')
  })

  it('shows a share the payer still has to confirm as open in the group', async () => {
    stubPaymentMethodsApi({
      invoice: makeInvoice({
        shares: [
          {
            transactionId: 30,
            group: { id: 7, name: 'República' },
            description: 'Aluguel',
            shareCents: 10000,
            paid: false,
            groupPaid: true,
          },
        ],
      }),
    })
    await openInvoice()

    const share = within(region('Lançamentos da fatura')).getByRole('listitem', { name: 'Aluguel (República)' })
    expect(share).toHaveTextContent('Sua parte · A acertar no grupo')
    expect(share).not.toHaveAttribute('data-realized')
  })

  it('opens another month from the history', async () => {
    const { router } = await openInvoice()

    await userEvent.click(await screen.findByRole('button', { name: 'Fatura de dez/26' }))

    await waitFor(() => expect(fetchInvoice).toHaveBeenCalledWith(1, '2026-12'))
    expect(router.state.location.search).toEqual({ month: '2026-12' })
  })

  it('pays the pending launches at once', async () => {
    await openInvoice()

    await userEvent.click(screen.getByRole('button', { name: 'Pagar fatura' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('Marcar como pago o lançamento pendente de Cartão Americanas em outubro de 2026')
    expect(confirm).toHaveTextContent('R$ 100,00')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Pagar fatura' }))

    await waitFor(() => expect(payInvoice).toHaveBeenCalledWith(1, '2026-10'))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(vi.mocked(fetchInvoice).mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('undoes the payment once every launch is realized', async () => {
    const paid = makeInvoice({
      transactions: [
        makeTransaction(21, { category: categories.leisure, plannedCents: 10000, realizedCents: 10000, paymentMethod: card }),
      ],
      shares: [],
    })
    stubPaymentMethodsApi({ invoice: paid })
    await openInvoice()

    expect(screen.queryByRole('button', { name: 'Pagar fatura' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer pagamento' }))
    const confirm = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Desfazer pagamento' }))

    await waitFor(() => expect(unpayInvoice).toHaveBeenCalledWith(1, '2026-10'))
  })

  it('realizes a single launch from its checkbox', async () => {
    await openInvoice()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Realizado: Cinema' }))

    await waitFor(() => expect(realizeTransaction).toHaveBeenCalledWith(21, 10000))
  })

  it('shows an empty invoice', async () => {
    stubPaymentMethodsApi({
      invoice: makeInvoice({ transactions: [], shares: [], count: 0, plannedCents: 0, pendingCents: 0 }),
    })
    await openInvoice()

    expect(screen.getByText(/Nenhuma despesa neste meio de pagamento/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pagar fatura' })).not.toBeInTheDocument()
  })

  it('shows not found for another user’s or an unknown method', async () => {
    vi.mocked(fetchInvoice).mockRejectedValue(new ApiError(404, ['Payment method not found']))
    await renderRoute('/meios-de-pagamento/99')

    expect(await screen.findByText('Meio de pagamento não encontrado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver meus meios de pagamento' })).toHaveAttribute(
      'href',
      '/meios-de-pagamento',
    )
  })

  it('treats a non-numeric id as not found', async () => {
    await renderRoute('/meios-de-pagamento/abc')

    expect(await screen.findByText('Meio de pagamento não encontrado')).toBeInTheDocument()
    expect(fetchInvoice).not.toHaveBeenCalled()
  })
})
