import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import { setGroupLink } from '@/features/groups/api'
import { fetchPaymentMethods } from '@/features/payment-methods/api'
import { createTransaction, updateTransaction } from '@/features/transactions/api'
import { ApiError } from '@/lib/api/client'
import { makeGroupStatement, stubBudgetApi } from '@/test/budget'
import { account, card, makePaymentMethod, makeSummary, stubPaymentMethodsApi } from '@/test/payment-methods'
import { makeAuthUser } from '@/test/auth'
import { renderRoute } from '@/test/render'
import { categories, makeTransaction, octoberTransactions, stubTransactionsApi } from '@/test/transactions'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/budget/api')
vi.mock('@/features/transactions/api')
vi.mock('@/features/groups/api')
vi.mock('@/features/payment-methods/api')

const createMock = vi.mocked(createTransaction)
const updateMock = vi.mocked(updateTransaction)
const row = (title: string) => screen.getByRole('listitem', { name: title })

async function openStatement() {
  const result = await renderRoute('/extrato')
  await screen.findByRole('heading', { name: 'Extrato' })
  return result
}

/** Cinema in Lazer (due day 1), paid with the card (due day 12) */
const cinema = makeTransaction(9, {
  category: categories.leisure,
  description: 'Cinema',
  plannedCents: 4500,
  paymentMethod: card,
})

describe('Payment methods in the statement (/extrato)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue(makeAuthUser())
    stubBudgetApi()
    stubTransactionsApi([...octoberTransactions, cinema])
    stubPaymentMethodsApi({
      summaries: [
        makeSummary(card),
        makeSummary(account),
        makeSummary(makePaymentMethod(3, { name: 'Cartão Antigo', active: false })),
      ],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the method’s due day and a link to its invoice', async () => {
    await openStatement()

    const item = row('Cinema')
    expect(item).toHaveTextContent('Vence dia 12')
    expect(within(item).getByRole('link', { name: /Cartão Americanas/ })).toHaveAttribute(
      'href',
      '/meios-de-pagamento/1?month=2026-10',
    )
    // Without a method, the category's due day
    expect(row('Aluguel')).toHaveTextContent('Vence dia 10')
    expect(within(row('Aluguel')).queryByRole('link')).not.toBeInTheDocument()
  })

  it('launches an expense in a payment method', async () => {
    await openStatement()

    await userEvent.click(screen.getAllByRole('button', { name: 'Nova despesa' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Nova despesa' })
    const select = await within(dialog).findByRole('combobox', { name: 'Meio de pagamento' })
    // Active methods only
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Nenhum',
      'Cartão Americanas',
      'Conta Corrente',
    ])
    expect(within(dialog).getByText('Sem meio de pagamento, vale o vencimento da categoria.')).toBeInTheDocument()

    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Categoria' }), 'Lazer')
    await userEvent.type(within(dialog).getByLabelText('Valor previsto (R$)'), '80')
    await userEvent.selectOptions(select, 'Cartão Americanas')
    expect(within(dialog).getByText('Vence dia 12, pelo Cartão Americanas.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({
        categoryId: 3,
        description: null,
        plannedCents: 8000,
        month: '2026-10',
        paymentMethodId: 1,
      }),
    )
    expect(fetchPaymentMethods).toHaveBeenCalledWith('2026-10')
  })

  it('offers no payment method for incomes', async () => {
    await openStatement()

    await userEvent.click(screen.getAllByRole('button', { name: 'Nova receita' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Nova receita' })
    await waitFor(() => expect(fetchPaymentMethods).toHaveBeenCalled())
    expect(within(dialog).queryByRole('combobox', { name: 'Meio de pagamento' })).not.toBeInTheDocument()
  })

  it('removes the method of a launch, sending only that change', async () => {
    await openStatement()

    await userEvent.click(screen.getByRole('button', { name: 'Opções de Cinema' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Editar lançamento' })
    const select = await within(dialog).findByRole('combobox', { name: 'Meio de pagamento' })
    await waitFor(() => expect(select).toHaveValue('1'))
    await userEvent.selectOptions(select, 'Nenhum')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        9,
        { categoryId: 3, description: 'Cinema', plannedCents: 4500, paymentMethodId: null },
        'ONE',
      ),
    )
  })

  it('shows the API error for an inactive method', async () => {
    createMock.mockRejectedValue(new ApiError(400, ['Payment method is inactive']))
    await openStatement()

    await userEvent.click(screen.getAllByRole('button', { name: 'Nova despesa' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Nova despesa' })
    const select = await within(dialog).findByRole('combobox', { name: 'Meio de pagamento' })
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Categoria' }), 'Lazer')
    await userEvent.type(within(dialog).getByLabelText('Valor previsto (R$)'), '80')
    await userEvent.selectOptions(select, 'Cartão Americanas')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

    expect(
      await within(dialog).findByText('Este meio de pagamento está inativo. Escolha outro ou reative-o.'),
    ).toBeInTheDocument()
  })

  it('assigns a payment method to a group’s expense shares', async () => {
    stubBudgetApi({ groupStatements: [makeGroupStatement()] })
    vi.mocked(setGroupLink).mockResolvedValue(undefined as never)
    await openStatement()

    const groups = screen.getByRole('region', { name: 'Grupos' })
    const republica = within(groups).getByRole('region', { name: 'República' })
    await userEvent.click(within(republica).getByRole('button', { name: /vínculo|Vincular/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Vincular ao orçamento' })
    const select = await within(dialog).findByRole('combobox', { name: 'Meio de pagamento das despesas' })
    await userEvent.selectOptions(select, 'Cartão Americanas')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(setGroupLink).toHaveBeenCalledWith(7, { expenseCategoryId: 1, incomeCategoryId: null, paymentMethodId: 1, categoryLinks: [] }),
    )
  })
})
