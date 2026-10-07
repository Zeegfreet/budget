import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import { fetchGroupStatements } from '@/features/budget/api'
import { setGroupLink } from '@/features/groups/api'
import { ApiError } from '@/lib/api/client'
import { budgetEntries, makeGroupStatement, stubBudgetApi } from '@/test/budget'
import { stubGroupsApi } from '@/test/groups'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/budget/api')
vi.mock('@/features/groups/api')

const groupsCard = () => screen.getByRole('region', { name: 'Grupos' })

/** Ana's 1000,00 share of the rent lands in Moradia, on top of her own 1800,00 */
const entriesWithShare = [
  ...budgetEntries.filter((e) => !(e.categoryId === 1 && e.month === '2026-10')),
  { categoryId: 1, month: '2026-10', amountCents: 180000, count: 1, groupCents: 100000 },
]

async function openDashboard() {
  const result = await renderRoute('/')
  await screen.findByRole('heading', { name: 'Dashboard' })
  return result
}

describe('Dashboard route (/) with finance groups', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue({ id: 1, name: 'Ana Souza', email: 'ana@example.com' })
    stubBudgetApi({ entries: entriesWithShare, groupStatements: [makeGroupStatement()] })
    stubGroupsApi()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hides the groups card for users without groups', async () => {
    stubBudgetApi()
    await openDashboard()

    expect(screen.queryByRole('region', { name: 'Grupos' })).not.toBeInTheDocument()
    expect(fetchGroupStatements).toHaveBeenCalledWith('2026-10')
  })

  it('shows the user’s side of each group: share, payments, settlement and link', async () => {
    await openDashboard()

    const republica = within(groupsCard()).getByRole('region', { name: 'República' })
    expect(within(republica).getByRole('link', { name: 'República' })).toHaveAttribute(
      'href',
      '/grupos/7?month=2026-10&tab=balanco',
    )
    expect(within(republica).getByText('A pagar')).toBeInTheDocument()
    expect(within(republica).getByRole('group', { name: 'Sua parte nas despesas' })).toHaveTextContent(
      'R$ 1.000,00 de R$ 2.000,00',
    )
    expect(within(republica).getByRole('group', { name: 'Você pagou' })).toHaveTextContent('R$ 0,00')
    expect(within(republica).getByRole('list', { name: 'Acerto em República' })).toHaveTextContent(
      'Pague R$ 1.000,00 a Bruno',
    )
    expect(republica).toHaveTextContent('No seu orçamento: despesas em Moradia, receitas em —.')
    // Only the statement lists the items
    expect(within(republica).queryByRole('list', { name: 'Lançamentos de República' })).not.toBeInTheDocument()
  })

  it('adds the share to the category cell and locks it, linking to the statement', async () => {
    await openDashboard()

    expect(screen.queryByRole('textbox', { name: 'Moradia em outubro de 2026' })).not.toBeInTheDocument()
    const link = screen.getByRole('link', {
      name: 'Moradia em outubro de 2026: inclui sua parte em grupos, ver no extrato',
    })
    expect(link).toHaveTextContent('R$ 2.800,00')
    expect(link).toHaveAttribute('href', '/extrato?month=2026-10')
    expect(link).toHaveAttribute('title', 'Inclui sua parte em grupos — veja no Extrato')
    // Other months stay editable
    expect(screen.getByRole('textbox', { name: 'Moradia em novembro de 2026' })).toHaveValue('1.800,00')
  })

  it('links the group’s incomes to a category and refreshes the budget', async () => {
    await openDashboard()
    vi.mocked(fetchGroupStatements).mockClear()

    await userEvent.click(within(groupsCard()).getByRole('button', { name: 'Alterar vínculo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Vincular ao orçamento' })
    expect(within(dialog).getByRole('combobox', { name: 'Despesas do grupo' })).toHaveValue('1')
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Receitas do grupo' }), 'Renda extra')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(setGroupLink).toHaveBeenCalledWith(7, { expenseCategoryId: 1, incomeCategoryId: 5 })
    expect(fetchGroupStatements).toHaveBeenCalled()
  })

  it('unlinks with “Não vincular” and keeps the dialog open on errors', async () => {
    vi.mocked(setGroupLink).mockRejectedValueOnce(new ApiError(400, ['Category is inactive']))
    await openDashboard()

    await userEvent.click(within(groupsCard()).getByRole('button', { name: 'Alterar vínculo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Vincular ao orçamento' })
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Despesas do grupo' }), 'Não vincular')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialog).findByText('Escolha uma categoria ativa.')).toBeInTheDocument()
    expect(setGroupLink).toHaveBeenCalledWith(7, { expenseCategoryId: null, incomeCategoryId: null })
  })
})
