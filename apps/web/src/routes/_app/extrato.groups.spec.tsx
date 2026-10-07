import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import { fetchGroupStatements } from '@/features/budget/api'
import { setGroupLink } from '@/features/groups/api'
import { makeGroupStatement, makeStatementItem, stubBudgetApi } from '@/test/budget'
import { stubGroupsApi } from '@/test/groups'
import { renderRoute } from '@/test/render'
import { stubTransactionsApi } from '@/test/transactions'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/budget/api')
vi.mock('@/features/transactions/api')
vi.mock('@/features/groups/api')

const region = (title: string) => screen.getByRole('region', { name: title })
const summaryItem = (title: string) => within(region('Resumo do mês')).getByRole('group', { name: title })

async function openStatement(path = '/extrato') {
  const result = await renderRoute(path)
  await screen.findByRole('heading', { name: 'Extrato' })
  return result
}

describe('Statement route (/extrato) with finance groups', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue({ id: 1, name: 'Ana Souza', email: 'ana@example.com' })
    stubBudgetApi({ groupStatements: [makeGroupStatement()] })
    stubTransactionsApi()
    stubGroupsApi()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the linked share under its category’s type, read-only, and counts it', async () => {
    await openStatement()

    const basics = screen.getByRole('list', { name: 'Despesas Básicas' })
    const share = within(basics).getByRole('listitem', { name: 'Aluguel (República)' })
    expect(share).toHaveTextContent('Moradia · Pago por Bruno')
    expect(share).toHaveTextContent('R$ 1.000,00')
    expect(share).toHaveTextContent('Sua parte de R$ 2.000,00')
    expect(share).toHaveAttribute('data-realized', 'true')
    expect(within(share).queryByRole('checkbox')).not.toBeInTheDocument()
    // Rent (1800,00 pending) + food (750,00 realized) + the paid share (1000,00)
    expect(summaryItem('Despesas do mês')).toHaveTextContent('R$ 3.550,00')
    expect(summaryItem('Despesas do mês')).toHaveTextContent('Realizado R$ 1.750,00 · a realizar R$ 1.800,00')
    // The unlinked income doesn't count
    expect(summaryItem('Receitas do mês')).toHaveTextContent('R$ 5.000,00')
    expect(within(region('Receitas')).queryByText('Sublocação')).not.toBeInTheDocument()
  })

  it('shows every group item and the settlement in the groups card', async () => {
    await openStatement()

    const republica = within(region('Grupos')).getByRole('region', { name: 'República' })
    const items = within(republica).getByRole('list', { name: 'Lançamentos de República' })
    expect(within(items).getAllByRole('listitem').map((i) => i.textContent)).toEqual([
      expect.stringContaining('Aluguel'),
      expect.stringContaining('Sublocação'),
    ])
    expect(within(items).getByText('Sublocação').closest('li')).toHaveTextContent('R$ 20,00 de R$ 40,00')
    expect(within(republica).getByText('A pagar')).toBeInTheDocument()
    expect(within(republica).getByRole('group', { name: 'Sua parte nas receitas' })).toHaveTextContent('R$ 20,00')
  })

  it('opens the group from a share’s menu', async () => {
    const { router } = await openStatement()

    await userEvent.click(screen.getByRole('button', { name: 'Opções de Aluguel (República)' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Abrir no grupo' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/grupos/7'))
    expect(router.state.location.search).toEqual({ month: '2026-10', tab: 'lancamentos' })
  })

  it('shows a month with only group shares instead of the empty state', async () => {
    stubTransactionsApi([])
    await openStatement()

    expect(screen.queryByText('Nenhum lançamento neste mês')).not.toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Aluguel (República)' })).toBeInTheDocument()
  })

  it('marks groups the user left and offers the link only for active ones', async () => {
    stubBudgetApi({
      groupStatements: [
        makeGroupStatement({
          group: { id: 8, name: 'Casa antiga' },
          active: false,
          items: [makeStatementItem(20, { description: 'Condomínio' })],
        }),
      ],
    })
    await openStatement()

    const old = within(region('Grupos')).getByRole('region', { name: 'Casa antiga' })
    expect(within(old).getByText('Você saiu')).toBeInTheDocument()
    expect(within(old).queryByRole('link', { name: 'Casa antiga' })).not.toBeInTheDocument()
    expect(within(old).queryByRole('button', { name: /vínculo|Vincular/ })).not.toBeInTheDocument()
    // Its linked shares still count in the statement
    expect(screen.getByRole('listitem', { name: 'Condomínio (Casa antiga)' })).toBeInTheDocument()
  })

  it('links an unlinked group from the card', async () => {
    stubBudgetApi({
      groupStatements: [
        makeGroupStatement({
          link: { expenseCategory: null, incomeCategory: null, paymentMethod: null },
          items: [makeStatementItem(10, { category: null })],
        }),
      ],
    })
    await openStatement()
    expect(screen.queryByRole('listitem', { name: 'Aluguel (República)' })).not.toBeInTheDocument()
    vi.mocked(fetchGroupStatements).mockClear()

    const republica = within(region('Grupos')).getByRole('region', { name: 'República' })
    expect(republica).toHaveTextContent('Não entra no seu orçamento')
    await userEvent.click(within(republica).getByRole('button', { name: 'Vincular categorias' }))
    const dialog = await screen.findByRole('dialog', { name: 'Vincular ao orçamento' })
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Despesas do grupo' }), 'Moradia')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(setGroupLink).toHaveBeenCalledWith(7, { expenseCategoryId: 1, incomeCategoryId: null, paymentMethodId: null }))
    await waitFor(() => expect(fetchGroupStatements).toHaveBeenCalled())
  })
})
