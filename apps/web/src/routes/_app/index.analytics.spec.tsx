import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import { fetchEntries, fetchLines, fetchSummary } from '@/features/budget/api'
import { UNSAVED_CHANGES_MESSAGE } from '@/features/budget/hooks'
import { makeAuthUser } from '@/test/auth'
import { stubBudgetApi } from '@/test/budget'
import { stubPaymentMethodsApi } from '@/test/payment-methods'
import { renderRoute } from '@/test/render'
import { stubTransactionsApi } from '@/test/transactions'

vi.mock('@/features/auth/api', () => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
}))
vi.mock('@/features/budget/api')
vi.mock('@/features/transactions/api')
vi.mock('@/features/payment-methods/api')

const fetchEntriesMock = vi.mocked(fetchEntries)
const fetchLinesMock = vi.mocked(fetchLines)
const fetchSummaryMock = vi.mocked(fetchSummary)

/** The rent row (Moradia), October */
const ALUGUEL_OUT = 'Aluguel em outubro de 2026'

async function openDashboard(path = '/') {
  const result = await renderRoute(path)
  await screen.findByRole('heading', { name: 'Dashboard' })
  return result
}

const period = () => screen.getByRole('group', { name: 'Período' })
const periodButton = () => within(period()).getByRole('button', { name: /^Período:/ })

/** Picks a period in the calendar by its first and last months ("novembro de 2026") */
async function pickPeriod(first: string, last: string) {
  await userEvent.click(periodButton())
  const calendar = await screen.findByRole('dialog')
  await userEvent.click(within(calendar).getByRole('button', { name: first }))
  await userEvent.click(within(calendar).getByRole('button', { name: last }))
}

/** Each row of a table as the text of its cells, header first */
function tableRows(name: string) {
  return within(screen.getByRole('table', { name }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => [...row.querySelectorAll('th, td')].map((c) => c.textContent?.replace(/\s/g, ' ').trim()))
}

async function openAnalysis() {
  await userEvent.click(screen.getByRole('tab', { name: 'Análise' }))
  await screen.findByRole('table', { name: 'Despesas por categoria' })
}

describe('Dashboard analysis tab and period (/)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Only the date: real timers keep user-event and Radix working
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue(makeAuthUser())
    stubBudgetApi()
    stubTransactionsApi()
    stubPaymentMethodsApi()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('period filter', () => {
    it('starts at the current month and covers the 11 after it, on the planning tab', async () => {
      await openDashboard()

      expect(periodButton()).toHaveAccessibleName('Período: outubro de 2026 a setembro de 2027')
      expect(screen.getByRole('tab', { name: 'Planejamento' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByText('Planejamento mensal')).toBeVisible()
      expect(fetchEntriesMock).toHaveBeenCalledWith('2026-10', '2027-09')
      expect(fetchLinesMock).toHaveBeenCalledWith('2026-10', '2027-09')
      expect(fetchSummaryMock).toHaveBeenCalledWith('2026-10')
      expect(within(period()).getByRole('button', { name: 'Redefinir período' })).toBeDisabled()
    })

    it('moves to the period picked in the calendar', async () => {
      const { router } = await openDashboard()

      await pickPeriod('novembro de 2026', 'outubro de 2027')

      await waitFor(() => expect(fetchEntriesMock).toHaveBeenCalledWith('2026-11', '2027-10'))
      expect(fetchLinesMock).toHaveBeenCalledWith('2026-11', '2027-10')
      expect(fetchSummaryMock).toHaveBeenCalledWith('2026-11')
      expect(router.state.location.search).toMatchObject({ from: '2026-11', to: '2027-10' })
      expect(await screen.findByText(/Este é o seu balanço de novembro de 2026/)).toBeInTheDocument()
      // The grid follows: October is out of the window
      await userEvent.click(screen.getAllByRole('button', { name: 'Moradia' }).at(-1)!)
      expect(screen.getByRole('textbox', { name: 'Aluguel em novembro de 2026' })).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: ALUGUEL_OUT })).not.toBeInTheDocument()
    })

    it('shortens the period and goes back to the default one', async () => {
      const { router } = await openDashboard()

      // The last month first: the calendar puts them in order
      await pickPeriod('dezembro de 2026', 'outubro de 2026')
      await waitFor(() => expect(fetchEntriesMock).toHaveBeenCalledWith('2026-10', '2026-12'))
      expect(periodButton()).toHaveAccessibleName('Período: outubro de 2026 a dezembro de 2026')

      await userEvent.click(within(period()).getByRole('button', { name: 'Redefinir período' }))
      await waitFor(() => expect(router.state.location.search).toMatchObject({ from: '2026-10', to: '2027-09' }))
      expect(periodButton()).toHaveAccessibleName('Período: outubro de 2026 a setembro de 2027')
    })

    it('opens the period and tab of the URL', async () => {
      await openDashboard('/?tab=analise&from=2026-11&to=2027-01')

      expect(screen.getByRole('tab', { name: 'Análise' })).toHaveAttribute('aria-selected', 'true')
      expect(periodButton()).toHaveAccessibleName('Período: novembro de 2026 a janeiro de 2027')
      expect(fetchEntriesMock).toHaveBeenCalledWith('2026-11', '2027-01')
      expect(tableRows('Receitas, despesas e saldos por mês').map((r) => r[0])).toEqual(['nov/26', 'dez/26', 'jan/27'])
    })

    it.each([
      ['an inverted period', '/?from=2027-01&to=2026-01'],
      ['a period longer than 24 months', '/?from=2025-01&to=2027-09'],
      ['a malformed month', '/?from=2026-13&to=2027-01'],
      ['only one end', '/?from=2026-11'],
    ])('falls back to the default period with %s', async (_, path) => {
      await openDashboard(path)

      expect(periodButton()).toHaveAccessibleName('Período: outubro de 2026 a setembro de 2027')
      expect(fetchEntriesMock).toHaveBeenCalledWith('2026-10', '2027-09')
    })
  })

  describe('analysis tab', () => {
    it('shows income, expenses, the balance and the accumulated balance per month', async () => {
      const { router } = await openDashboard()
      await openAnalysis()

      expect(router.state.location.search).toMatchObject({ tab: 'analise' })
      const rows = tableRows('Receitas, despesas e saldos por mês')
      expect(rows).toHaveLength(12)
      // Opening balance R$ 2.500 (summary of October), then each month's balance
      expect(rows[0]).toEqual(['out/26', 'R$ 5.000,00', 'R$ 2.500,00', 'R$ 2.500,00', 'R$ 5.000,00'])
      expect(rows[1]).toEqual(['nov/26', 'R$ 0,00', 'R$ 1.800,00', '-R$ 1.800,00', 'R$ 3.200,00'])
      expect(rows[2]).toEqual(['dez/26', 'R$ 0,00', 'R$ 300,00', '-R$ 300,00', 'R$ 2.900,00'])
      expect(rows[11]).toEqual(['set/27', 'R$ 0,00', 'R$ 0,00', 'R$ 0,00', 'R$ 2.900,00'])
    })

    it('reveals the chart numbers on demand', async () => {
      await openDashboard('/?tab=analise')

      const toggle = await screen.findByRole('button', { name: 'Ver tabela' })
      await userEvent.click(toggle)
      expect(screen.getByRole('button', { name: 'Ocultar tabela' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('lists expenses per category: the first month, the period and its share', async () => {
      await openDashboard()
      await openAnalysis()

      expect(screen.getByRole('columnheader', { name: 'out/26' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'out/26 a set/27' })).toBeInTheDocument()
      expect(tableRows('Despesas por categoria')).toEqual([
        ['MoradiaDespesas Básicas', 'R$ 1.800,00', 'R$ 3.600,00', '78,26%'],
        ['AlimentaçãoDespesas Básicas', 'R$ 700,00', 'R$ 700,00', '15,22%'],
        ['LazerCustos de Vida', 'R$ 0,00', 'R$ 300,00', '6,52%'],
        ['Total', 'R$ 2.500,00', 'R$ 4.600,00', '100%'],
      ])
      expect(screen.getByRole('img', { name: /^Moradia de out\/26 a set\/27: R\$\s3\.600,00$/ })).toBeInTheDocument()
      // Incomes stay out
      expect(within(screen.getByRole('table', { name: 'Despesas por categoria' })).queryByText('Salário')).toBeNull()
    })

    it('counts the shares of linked groups in their category', async () => {
      stubBudgetApi({ shares: [{ categoryId: 2, month: '2026-11', amountCents: 40000 }] })
      await openDashboard('/?tab=analise')
      await screen.findByRole('table', { name: 'Despesas por categoria' })

      expect(tableRows('Despesas por categoria')[1]).toEqual([
        'AlimentaçãoDespesas Básicas',
        'R$ 700,00',
        'R$ 1.100,00',
        '22%',
      ])
      expect(tableRows('Receitas, despesas e saldos por mês')[1][2]).toBe('R$ 2.200,00')
    })

    it('says so when the period has no expenses', async () => {
      stubBudgetApi({ lines: [] })
      await openDashboard('/?tab=analise')

      expect(await screen.findByText('Nenhuma despesa no período')).toBeInTheDocument()
    })
  })

  describe('unsaved planning', () => {
    it('keeps the draft across tabs without asking', async () => {
      const confirm = vi.spyOn(window, 'confirm')
      await openDashboard()
      await userEvent.click(screen.getAllByRole('button', { name: 'Moradia' }).at(-1)!)
      const rent = screen.getByRole('textbox', { name: ALUGUEL_OUT })
      await userEvent.clear(rent)
      await userEvent.type(rent, '10')
      await userEvent.tab()

      await openAnalysis()
      expect(screen.getByText(/A análise mostra apenas valores salvos/)).toBeInTheDocument()
      // Saved values only
      expect(tableRows('Despesas por categoria')[0][1]).toBe('R$ 1.800,00')

      await userEvent.click(screen.getByRole('tab', { name: 'Planejamento' }))
      expect(screen.getByRole('textbox', { name: ALUGUEL_OUT })).toHaveValue('10,00')
      expect(confirm).not.toHaveBeenCalled()
      confirm.mockRestore()
    })

    it('asks before a new period drops the draft', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const { router } = await openDashboard()
      await userEvent.click(screen.getAllByRole('button', { name: 'Moradia' }).at(-1)!)
      const rent = screen.getByRole('textbox', { name: ALUGUEL_OUT })
      await userEvent.clear(rent)
      await userEvent.type(rent, '10')
      await userEvent.tab()

      await pickPeriod('novembro de 2026', 'outubro de 2027')
      expect(confirm).toHaveBeenCalledWith(UNSAVED_CHANGES_MESSAGE)
      expect(router.state.location.search).not.toHaveProperty('from')
      expect(screen.getByRole('textbox', { name: ALUGUEL_OUT })).toHaveValue('10,00')

      confirm.mockReturnValue(true)
      await pickPeriod('novembro de 2026', 'outubro de 2027')
      await waitFor(() => expect(router.state.location.search).toMatchObject({ from: '2026-11' }))
      expect(await screen.findByText(/Este é o seu balanço de novembro de 2026/)).toBeInTheDocument()
      expect(screen.queryByText(/alteraç(ão|ões) não salva/i)).not.toBeInTheDocument()
      confirm.mockRestore()
    })
  })
})
