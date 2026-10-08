import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import {
  createPaymentMethod,
  deletePaymentMethod,
  fetchInvoice,
  fetchPaymentMethods,
  updatePaymentMethod,
} from '@/features/payment-methods/api'
import { ApiError } from '@/lib/api/client'
import { stubBudgetApi } from '@/test/budget'
import { account, card, makePaymentMethod, makeSummary, stubPaymentMethodsApi } from '@/test/payment-methods'
import { makeAuthUser } from '@/test/auth'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/budget/api')
vi.mock('@/features/payment-methods/api')

const fetchMock = vi.mocked(fetchPaymentMethods)
const list = () => screen.getByRole('list', { name: 'Meus meios de pagamento' })
const card_ = (name: string) => within(list()).getByRole('listitem', { name })

async function openPage(path = '/meios-de-pagamento') {
  const result = await renderRoute(path)
  await screen.findByRole('heading', { name: 'Meios de pagamento', level: 1 })
  return result
}

async function cardAction(name: string, action: string) {
  await userEvent.click(screen.getByRole('button', { name: `Opções de ${name}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: action }))
}

describe('Payment methods route (/meios-de-pagamento)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue(makeAuthUser())
    stubBudgetApi()
    stubPaymentMethodsApi()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the methods with the month’s invoice and is in the side menu', async () => {
    await openPage()

    expect(fetchMock).toHaveBeenCalledWith('2026-10')
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByRole('link', { name: 'Meios de pagamento' })).toHaveAttribute('data-active', 'true')

    const cardItem = card_('Cartão Americanas')
    expect(within(cardItem).getByText(/Cartão de crédito · Vence dia 12/)).toBeInTheDocument()
    expect(within(cardItem).getByText('R$ 250,00')).toBeInTheDocument()
    expect(within(cardItem).getByText(/a pagar/)).toHaveTextContent('a pagar R$ 200,00')
    expect(within(cardItem).getByRole('link')).toHaveAttribute('href', '/meios-de-pagamento/1?month=2026-10')

    const accountItem = card_('Conta Corrente')
    expect(within(accountItem).getByText(/Vencimento de cada categoria/)).toBeInTheDocument()
    expect(within(accountItem).getByText('Sem lançamentos')).toBeInTheDocument()
  })

  it('changes month', async () => {
    await openPage()
    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('2026-11'))
    expect(screen.getByText(/fatura de novembro de 2026/)).toBeInTheDocument()
  })

  it('shows an empty state without methods', async () => {
    stubPaymentMethodsApi({ summaries: [] })
    await openPage()

    expect(screen.getByText('Nenhum meio de pagamento')).toBeInTheDocument()
  })

  it('hides inactive methods unless asked', async () => {
    stubPaymentMethodsApi({
      summaries: [makeSummary(card), makeSummary(makePaymentMethod(3, { name: 'Cartão Antigo', active: false }))],
    })
    await openPage()

    expect(within(list()).queryByRole('listitem', { name: 'Cartão Antigo' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch'))
    expect(within(card_('Cartão Antigo')).getByText('Inativo')).toBeInTheDocument()
  })

  it('creates a method and opens its invoice', async () => {
    vi.mocked(createPaymentMethod).mockResolvedValue(makePaymentMethod(9, { name: 'Nubank', dueDay: 5 }))
    vi.mocked(fetchInvoice).mockResolvedValue({
      paymentMethod: makePaymentMethod(9, { name: 'Nubank', dueDay: 5 }),
      month: '2026-10',
      dueDate: '2026-10-05',
      plannedCents: 0,
      realizedCents: 0,
      pendingCents: 0,
      effectiveCents: 0,
      count: 0,
      transactions: [],
      shares: [],
    })
    const { router } = await openPage()

    await userEvent.click(screen.getByRole('button', { name: 'Novo meio de pagamento' }))
    const dialog = await screen.findByRole('dialog')
    // Validation first
    await userEvent.type(within(dialog).getByLabelText('Dia de vencimento (opcional)'), '40')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))
    expect(within(dialog).getByText('Informe o nome.')).toBeInTheDocument()
    expect(within(dialog).getByText('Informe um dia de 1 a 31.')).toBeInTheDocument()
    expect(createPaymentMethod).not.toHaveBeenCalled()

    await userEvent.type(within(dialog).getByLabelText('Nome'), '  Nubank ')
    await userEvent.clear(within(dialog).getByLabelText('Dia de vencimento (opcional)'))
    await userEvent.type(within(dialog).getByLabelText('Dia de vencimento (opcional)'), '5')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/meios-de-pagamento/9'))
    expect(createPaymentMethod).toHaveBeenCalledWith({ name: 'Nubank', type: 'CREDIT_CARD', dueDay: 5 })
    expect(await screen.findByRole('heading', { name: 'Nubank', level: 1 })).toBeInTheDocument()
  })

  it('shows the API’s duplicate-name error', async () => {
    vi.mocked(createPaymentMethod).mockRejectedValue(
      new ApiError(409, ['A payment method with this name already exists']),
    )
    await openPage()

    await userEvent.click(screen.getByRole('button', { name: 'Novo meio de pagamento' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Cartão Americanas')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))

    expect(await within(dialog).findByText('Já existe um meio de pagamento com esse nome.')).toBeInTheDocument()
  })

  it('edits, inactivates and deletes a method', async () => {
    await openPage()

    await cardAction('Conta Corrente', 'Editar')
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Nome')).toHaveValue('Conta Corrente')
    expect(within(dialog).getByLabelText('Tipo')).toHaveValue('ACCOUNT')
    await userEvent.type(within(dialog).getByLabelText('Dia de vencimento (opcional)'), '10')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(updatePaymentMethod).toHaveBeenCalledWith(account.id, {
        name: 'Conta Corrente',
        type: 'ACCOUNT',
        dueDay: 10,
      }),
    )

    await cardAction('Cartão Americanas', 'Inativar')
    await waitFor(() => expect(updatePaymentMethod).toHaveBeenCalledWith(card.id, { active: false }))

    await cardAction('Cartão Americanas', 'Excluir')
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('voltam a vencer no dia da categoria')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(deletePaymentMethod).toHaveBeenCalledWith(card.id))
    // The list is fetched again after each change
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4)
  })
})
