import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import { updateGroup } from '@/features/budget/api'
import { ApiError } from '@/lib/api/client'
import { budgetGroups, stubBudgetApi } from '@/test/budget'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/budget/api')

const updateGroupMock = vi.mocked(updateGroup)

/** Despesas Básicas 50%, Custos de Vida 30% */
const withGoals = budgetGroups.map((g) =>
  g.id === 10 ? { ...g, goalPercent: 50 } : g.id === 20 ? { ...g, goalPercent: 30 } : g,
)

const panel = () => screen.getByRole('region', { name: 'Metas por tipo de despesa' })
const goal = (name: string) => within(panel()).getByRole('listitem', { name })

async function openDashboard() {
  await renderRoute('/')
  await screen.findByRole('heading', { name: 'Dashboard' })
}

async function openGoalsDialog() {
  await userEvent.click(within(panel()).getByRole('button', { name: 'Definir metas' }))
  return screen.findByRole('dialog', { name: 'Metas por tipo de despesa' })
}

describe('Dashboard: goals per expense type', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue({ id: 1, name: 'Ana Souza', email: 'ana@example.com' })
    stubBudgetApi()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sits above the balance cards and invites to set goals when there are none', async () => {
    await openDashboard()

    const region = panel()
    expect(region).toHaveTextContent('Nenhuma meta definida')
    expect(region).toHaveTextContent('Mês atual: outubro de 2026; período: out/26 a set/27.')
    const cards = screen.getByRole('region', { name: 'Saldo de abertura' })
    expect(region.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows each goal for the current month and for the period', async () => {
    stubBudgetApi({ groups: withGoals })
    await openDashboard()

    // Despesas Básicas: 2.500 of 5.000 in October (50%: at the goal), 4.300 of 5.000 in the period
    const basics = goal('Despesas Básicas')
    expect(basics).toHaveTextContent('Meta 50%')
    const month = within(basics).getByRole('meter', { name: 'Mês atual' })
    expect(month).toHaveAttribute('aria-valuenow', '50')
    expect(month).toHaveAttribute('aria-valuetext', '50% das receitas, meta 50%')
    expect(month).toHaveAttribute('data-status', 'warning')
    const period = within(basics).getByRole('meter', { name: 'Período' })
    expect(period).toHaveAttribute('aria-valuenow', '86')
    expect(period).toHaveAttribute('data-status', 'over')

    // Custos de Vida: nothing in October, 300 in the period (6%)
    const living = goal('Custos de Vida')
    expect(within(living).getByRole('meter', { name: 'Mês atual' })).toHaveAttribute('data-status', 'ok')
    expect(within(living).getByRole('meter', { name: 'Período' })).toHaveAttribute('aria-valuetext', '6% das receitas, meta 30%')

    expect(panel()).toHaveTextContent('Metas somadas: 80% das receitas · realizado no mês: 50% · no período: 92%')
  })

  it('follows unsaved edits of the grid', async () => {
    stubBudgetApi({ groups: withGoals })
    await openDashboard()

    const input = screen.getByRole('textbox', { name: 'Moradia em outubro de 2026' })
    await userEvent.click(input)
    await userEvent.clear(input)
    await userEvent.type(input, '2.000')
    await userEvent.tab()

    // 2.000 + 700 of 5.000
    expect(within(goal('Despesas Básicas')).getByRole('meter', { name: 'Mês atual' })).toHaveAttribute(
      'data-status',
      'over',
    )
    expect(within(goal('Despesas Básicas')).getByRole('meter', { name: 'Mês atual' })).toHaveAttribute(
      'aria-valuenow',
      '54',
    )
  })

  it('shows no share for a month without income', async () => {
    stubBudgetApi({ groups: withGoals, entries: [{ categoryId: 1, month: '2026-10', amountCents: 1000 }] })
    await openDashboard()

    const meter = within(goal('Despesas Básicas')).getByRole('meter', { name: 'Mês atual' })
    expect(meter).not.toHaveAttribute('aria-valuenow')
    expect(meter).toHaveAttribute('aria-valuetext', 'sem receitas, meta 50%')
    expect(meter).toHaveAttribute('data-status', 'over')
  })

  it('sets the goals of every expense type at once, warning above 100%', async () => {
    await openDashboard()
    const dialog = await openGoalsDialog()

    // Only expense types
    expect(within(dialog).getAllByRole('textbox').map((i) => i.id)).toEqual(['goal-10', 'goal-20'])
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Despesas Básicas' }), '50')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Custos de Vida' }), '60')
    expect(within(dialog).getByRole('status')).toHaveTextContent('Soma das metas: 110% — acima de 100% das receitas')

    const living = within(dialog).getByRole('textbox', { name: 'Custos de Vida' })
    await userEvent.clear(living)
    await userEvent.type(living, '30')
    expect(within(dialog).getByRole('status')).toHaveTextContent('Soma das metas: 80%')

    stubBudgetApi({ groups: withGoals })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar metas' }))

    expect(updateGroupMock).toHaveBeenCalledWith(10, { goalPercent: 50 })
    expect(updateGroupMock).toHaveBeenCalledWith(20, { goalPercent: 30 })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await within(panel()).findByRole('listitem', { name: 'Despesas Básicas' })).toBeInTheDocument()
  })

  it('removes a goal left blank and sends only the changes', async () => {
    stubBudgetApi({ groups: withGoals })
    await openDashboard()
    const dialog = await openGoalsDialog()

    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Despesas Básicas' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar metas' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(updateGroupMock).toHaveBeenCalledTimes(1)
    expect(updateGroupMock).toHaveBeenCalledWith(10, { goalPercent: null })
  })

  it('rejects invalid percentages and shows API errors', async () => {
    await openDashboard()
    const dialog = await openGoalsDialog()
    const basics = within(dialog).getByRole('textbox', { name: 'Despesas Básicas' })

    await userEvent.type(basics, '12,5')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar metas' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Use percentuais inteiros entre 1 e 100')
    expect(basics).toHaveAttribute('aria-invalid', 'true')
    expect(updateGroupMock).not.toHaveBeenCalled()

    updateGroupMock.mockRejectedValue(new ApiError(400, ['goalPercent must not be greater than 100']))
    await userEvent.clear(basics)
    await userEvent.type(basics, '40')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar metas' }))
    expect(await within(dialog).findByText('goalPercent must not be greater than 100')).toBeInTheDocument()
  })

  it('leaves inactive types out of the goals', async () => {
    stubBudgetApi({ groups: withGoals.map((g) => (g.id === 20 ? { ...g, active: false } : g)) })
    await openDashboard()

    expect(within(panel()).queryByRole('listitem', { name: 'Custos de Vida' })).not.toBeInTheDocument()
    const dialog = await openGoalsDialog()
    expect(within(dialog).queryByRole('textbox', { name: 'Custos de Vida' })).not.toBeInTheDocument()
  })
})
