import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import { fetchGroupStatements } from '@/features/budget/api'
import { setGroupLink } from '@/features/groups/api'
import { ApiError } from '@/lib/api/client'
import { makeGroupStatement, stubBudgetApi } from '@/test/budget'
import { stubGroupsApi } from '@/test/groups'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/budget/api')
vi.mock('@/features/groups/api')

const groupsCard = () => screen.getByRole('region', { name: 'Grupos' })

/** Ana's 1000,00 share of the rent lands in Moradia, on top of her own 1800,00 */
const shares = [{ categoryId: 1, month: '2026-10', amountCents: 100000 }]

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
    stubBudgetApi({ shares, groupStatements: [makeGroupStatement()] })
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

  it('adds the share to the category and lists it as a read-only row, linking to the statement', async () => {
    await openDashboard()
    const moradia = () =>
      within(screen.getByRole('rowheader', { name: 'Moradia' }).closest('tr')!).getAllByRole('cell')
    expect(moradia()[0]).toHaveTextContent('R$ 2.800,00')

    await userEvent.click(screen.getByRole('button', { name: 'Moradia' }))

    const shareRow = screen.getByRole('rowheader', { name: 'Rateios de grupos em Moradia' }).closest('tr')!
    const link = within(shareRow).getByRole('link', {
      name: 'Sua parte em grupos em outubro de 2026, ver no extrato',
    })
    expect(link).toHaveTextContent('R$ 1.000,00')
    expect(link).toHaveAttribute('href', '/extrato?month=2026-10')
    expect(link).toHaveAttribute('title', 'Sua parte em grupos — veja no Extrato')
    expect(within(shareRow).queryByRole('textbox')).not.toBeInTheDocument()
    // The own launch stays editable
    expect(screen.getByRole('textbox', { name: 'Aluguel em outubro de 2026' })).toHaveValue('1.800,00')
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
    expect(setGroupLink).toHaveBeenCalledWith(7, { expenseCategoryId: 1, incomeCategoryId: 5, paymentMethodId: null })
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
    expect(setGroupLink).toHaveBeenCalledWith(7, { expenseCategoryId: null, incomeCategoryId: null, paymentMethodId: null })
  })
})
