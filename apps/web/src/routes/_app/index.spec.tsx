import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe, logout } from '@/features/auth/api'
import {
  fetchCategories,
  fetchEntries,
  fetchLines,
  fetchSummary,
  savePlan,
  updateInitialBalance,
} from '@/features/budget/api'
import { UNSAVED_CHANGES_MESSAGE } from '@/features/budget/hooks'
import { fetchProfile } from '@/features/profile/api'
import { createTransaction, deleteTransaction, updateTransaction } from '@/features/transactions/api'
import { ApiError } from '@/lib/api/client'
import { budgetLines, budgetSummary, entriesOf, makeLine, stubBudgetApi } from '@/test/budget'
import { stubPaymentMethodsApi } from '@/test/payment-methods'
import { makeAuthUser } from '@/test/auth'
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
// The account menu leads to the profile page
vi.mock('@/features/profile/api')

const fetchMeMock = vi.mocked(fetchMe)
const logoutMock = vi.mocked(logout)
const fetchCategoriesMock = vi.mocked(fetchCategories)
const fetchEntriesMock = vi.mocked(fetchEntries)
const fetchLinesMock = vi.mocked(fetchLines)
const fetchSummaryMock = vi.mocked(fetchSummary)
const savePlanMock = vi.mocked(savePlan)
const updateInitialBalanceMock = vi.mocked(updateInitialBalance)

const unauthorized = new ApiError(401, ['Unauthorized'])

const openUserMenu = () =>
  userEvent.click(screen.getByRole('button', { name: /menu da conta/i }))

/** Text of a row's cells (after the row header), e.g. the month totals */
const rowCells = (header: string) =>
  within(screen.getByRole('rowheader', { name: header }).closest('tr')!)
    .getAllByRole('cell')
    .map((cell) => cell.textContent?.replace(/\s/g, ' '))

const card = (title: string) => screen.getByRole('region', { name: title })
const cell = (name: string) => screen.getByRole('textbox', { name })
/** The rent row (Moradia), October */
const ALUGUEL_OUT = 'Aluguel em outubro de 2026'

/** Opens the dashboard with the given categories expanded to their launches */
async function openDashboard(...expand: string[]) {
  const result = await renderRoute('/')
  await screen.findByRole('heading', { name: 'Dashboard' })
  for (const category of expand) await expandCategory(category)
  return result
}

/** Shows a category's launch rows (categories start collapsed) */
async function expandCategory(name: string) {
  // The category's toggle (a type may share its name, e.g. Salário)
  const toggle = screen.getAllByRole('button', { name }).at(-1)!
  await userEvent.click(toggle)
}

/** Opens a row's menu through its hover "⋯" button and picks an option */
async function rowAction(row: string, option: string) {
  await userEvent.click(screen.getByRole('button', { name: `Opções de ${row}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: option }))
}

async function typeInCell(name: string, text: string) {
  await userEvent.click(cell(name))
  await userEvent.clear(cell(name))
  await userEvent.type(cell(name), text)
  await userEvent.tab()
}

async function cellAction(name: string, action: string) {
  await userEvent.click(screen.getByRole('button', { name: `Ações de ${name}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: action }))
}

describe('Dashboard route (/)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Only the date: real timers keep user-event and Radix working
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    fetchMeMock.mockResolvedValue(makeAuthUser())
    stubBudgetApi()
    stubTransactionsApi()
    stubPaymentMethodsApi()
    vi.mocked(fetchProfile).mockResolvedValue({
      id: 1,
      email: 'ana@example.com',
      name: 'Ana Souza',
      birthDate: '1990-05-20',
      cep: '01001000',
      city: 'São Paulo',
      state: 'SP',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the dashboard in the side menu layout and greets the user', async () => {
    await openDashboard()

    expect(screen.getByText('Olá, Ana! Este é o seu balanço de outubro de 2026.')).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('data-active', 'true')
  })

  describe('balance cards', () => {
    it('shows opening, income, expenses, month balance and accumulated balance', async () => {
      await openDashboard()

      expect(fetchSummaryMock).toHaveBeenCalledWith('2026-10')
      expect(within(card('Saldo de abertura')).getByText(/2\.500,00/)).toBeInTheDocument()
      expect(within(card('Receitas do mês')).getByText(/5\.000,00/)).toBeInTheDocument()
      expect(within(card('Despesas do mês')).getByText(/2\.500,00/)).toBeInTheDocument()
      expect(within(card('Saldo do mês')).getByText(/2\.500,00/)).toBeInTheDocument()
      expect(within(card('Saldo acumulado')).getByText(/5\.000,00/)).toBeInTheDocument()
    })

    it('counts realized amounts in the cards, plus unsaved edits of the month', async () => {
      // Alimentação was realized for R$ 800,00 instead of the planned R$ 700,00
      stubBudgetApi({ summary: { ...budgetSummary, expenseCents: 260000 } })
      await openDashboard()

      expect(rowCells('Despesas')[0]).toBe('R$ 2.500,00')
      expect(within(card('Despesas do mês')).getByText(/2\.600,00/)).toBeInTheDocument()
      expect(within(card('Saldo acumulado')).getByText(/4\.900,00/)).toBeInTheDocument()

      await expandCategory('Moradia')
      await typeInCell(ALUGUEL_OUT, '2.000')
      expect(within(card('Despesas do mês')).getByText(/2\.800,00/)).toBeInTheDocument()
    })

    it('adjusts the initial balance, accepting negative amounts', async () => {
      await openDashboard()
      fetchSummaryMock.mockResolvedValue({ ...budgetSummary, initialBalanceCents: -50000, openingBalanceCents: 100000 })

      await userEvent.click(screen.getByRole('button', { name: 'Ajustar saldo inicial' }))
      const dialog = await screen.findByRole('dialog', { name: 'Saldo inicial' })
      const input = within(dialog).getByRole('textbox', { name: 'Valor (R$)' })
      expect(input).toHaveValue('1.000,00')
      await userEvent.clear(input)
      await userEvent.type(input, '-500')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(updateInitialBalanceMock).toHaveBeenCalledWith(-50000)
      expect(await within(card('Saldo de abertura')).findByText(/1\.000,00/)).toBeInTheDocument()
    })

    it('keeps the dialog open with an error for invalid amounts or API failures', async () => {
      await openDashboard()
      await userEvent.click(screen.getByRole('button', { name: 'Ajustar saldo inicial' }))
      const dialog = await screen.findByRole('dialog')
      const input = within(dialog).getByRole('textbox')

      await userEvent.clear(input)
      await userEvent.type(input, 'abc')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Informe um valor válido')
      expect(updateInitialBalanceMock).not.toHaveBeenCalled()

      updateInitialBalanceMock.mockRejectedValue(new ApiError(400, ['amountCents must be an integer number']))
      await userEvent.clear(input)
      await userEvent.type(input, '10')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))
      expect(await within(dialog).findByText('amountCents must be an integer number')).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  describe('monthly grid', () => {
    it('shows the current month and the next 11, Despesas before Receitas, categories collapsed', async () => {
      await openDashboard()

      expect(fetchEntriesMock).toHaveBeenCalledWith('2026-10', '2027-09')
      expect(fetchLinesMock).toHaveBeenCalledWith('2026-10', '2027-09')
      const table = screen.getByRole('table', { name: 'Planejamento mensal' })
      const headers = within(table).getAllByRole('columnheader')
      expect(headers).toHaveLength(14)
      expect(headers[1]).toHaveAccessibleName('outubro de 2026')
      expect(headers[1]).toHaveTextContent(/^out\/26\s*\(atual\)$/)
      expect(headers[12]).toHaveAccessibleName('setembro de 2027')
      expect(headers[13]).toHaveTextContent('Total')

      const sections = within(table)
        .getAllByRole('rowheader')
        .map((h) => h.getAttribute('aria-label') ?? h.textContent)
      expect(sections).toEqual([
        'Despesas', 'Despesas Básicas', 'Moradia', 'Alimentação', 'Custos de Vida', 'Lazer',
        'Receitas', 'Salário', 'Salário', 'Renda Extra', 'Renda extra',
        'Saldo do mês', 'Saldo acumulado',
      ])
      expect(screen.getByRole('button', { name: 'Moradia' })).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('sums the launches into categories, types and sections, and projects the balance', async () => {
      await openDashboard()

      expect(rowCells('Moradia').slice(0, 2)).toEqual(['R$ 1.800,00', 'R$ 1.800,00'])
      expect(rowCells('Lazer')[0]).toBe('R$ 0,00')
      expect(rowCells('Despesas').slice(0, 3)).toEqual(['R$ 2.500,00', 'R$ 1.800,00', 'R$ 300,00'])
      expect(rowCells('Receitas').slice(0, 2)).toEqual(['R$ 5.000,00', 'R$ 0,00'])
      expect(rowCells('Saldo do mês').slice(0, 3)).toEqual(['R$ 2.500,00', '-R$ 1.800,00', '-R$ 300,00'])
      // Opening 2.500 + 2.500, then − 1.800, then − 300
      expect(rowCells('Saldo acumulado').slice(0, 3)).toEqual(['R$ 5.000,00', 'R$ 3.200,00', 'R$ 2.900,00'])
    })

    it('expands a category into its launches, with their due day, and a row to add one', async () => {
      await openDashboard('Moradia', 'Lazer')

      expect(screen.getByRole('button', { name: 'Moradia' })).toHaveAttribute('aria-expanded', 'true')
      const rent = screen.getByRole('rowheader', { name: 'Aluguel' })
      expect(rent).toHaveTextContent('Vence dia 10')
      expect(cell(ALUGUEL_OUT)).toHaveValue('1.800,00')
      expect(cell('Aluguel em dezembro de 2026')).toHaveValue('')
      expect(rowCells('Moradia')[0]).toBe('R$ 1.800,00')
      expect(screen.getByRole('rowheader', { name: 'Moradia' })).toHaveTextContent('1 lançamento')
      // A launch without description
      expect(cell('Sem descrição em dezembro de 2026')).toHaveValue('300,00')
      expect(screen.getByRole('button', { name: 'Novo lançamento em Lazer' })).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Moradia' }))
      expect(screen.queryByRole('rowheader', { name: 'Aluguel' })).not.toBeInTheDocument()
    })

    it('totals every row of the window in the last column', async () => {
      await openDashboard('Lazer')

      // Moradia 1.800 + 1.800; Despesas 2.500 + 1.800 + 300
      expect(rowCells('Moradia').at(-1)).toBe('R$ 3.600,00')
      expect(rowCells('Despesas Básicas').at(-1)).toBe('R$ 4.300,00')
      expect(rowCells('Despesas').at(-1)).toBe('R$ 4.600,00')
      expect(rowCells('Receitas').at(-1)).toBe('R$ 5.000,00')
      expect(rowCells('Saldo do mês').at(-1)).toBe('R$ 400,00')
      // Closing balance of the window: opening 2.500 + 400
      expect(rowCells('Saldo acumulado').at(-1)).toBe('R$ 2.900,00')

      await typeInCell('Sem descrição em janeiro de 2027', '100')
      expect(rowCells('Sem descrição').at(-1)).toBe('R$ 400,00')
      expect(rowCells('Lazer').at(-1)).toBe('R$ 400,00')
      expect(rowCells('Despesas').at(-1)).toBe('R$ 4.700,00')
    })

    it('collapses and expands sections and types', async () => {
      await openDashboard()
      const despesas = screen.getByRole('button', { name: 'Despesas' })
      expect(despesas).toHaveAttribute('aria-expanded', 'true')

      await userEvent.click(screen.getByRole('button', { name: 'Despesas Básicas' }))
      expect(screen.queryByRole('rowheader', { name: 'Moradia' })).not.toBeInTheDocument()
      expect(screen.getByRole('rowheader', { name: 'Lazer' })).toBeInTheDocument()

      await userEvent.click(despesas)
      expect(despesas).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('rowheader', { name: 'Custos de Vida' })).not.toBeInTheDocument()
      // Totals still count hidden rows
      expect(rowCells('Despesas')[0]).toBe('R$ 2.500,00')

      await userEvent.click(despesas)
      expect(screen.getByRole('rowheader', { name: 'Custos de Vida' })).toBeInTheDocument()
      expect(screen.queryByRole('rowheader', { name: 'Moradia' })).not.toBeInTheDocument()
    })

    it('edits a launch, updating its category, totals and cards before saving', async () => {
      await openDashboard('Moradia')

      await typeInCell(ALUGUEL_OUT, '2.000')

      expect(cell(ALUGUEL_OUT)).toHaveValue('2.000,00')
      expect(cell(ALUGUEL_OUT).closest('[data-changed]')).not.toBeNull()
      expect(rowCells('Moradia')[0]).toBe('R$ 2.000,00')
      expect(rowCells('Despesas')[0]).toBe('R$ 2.700,00')
      expect(within(card('Despesas do mês')).getByText(/2\.700,00/)).toBeInTheDocument()
      expect(within(card('Saldo acumulado')).getByText(/4\.800,00/)).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Alterações não salvas' })).toHaveTextContent('1 alteração não salva')
      expect(savePlanMock).not.toHaveBeenCalled()
    })

    // Many typed cells in two expanded categories: slow when every spec file runs in parallel
    it('saves only the changed months of each launch and clears the draft', async () => {
      await openDashboard('Moradia', 'Lazer')
      await typeInCell(ALUGUEL_OUT, '2000')
      await typeInCell('Sem descrição em novembro de 2026', '150,5')
      // Typing the saved value back is not a change
      await typeInCell('Aluguel em novembro de 2026', '1.800,00')

      const saved = [
        makeLine(
          101,
          1,
          [
            ['2026-10', 200000],
            ['2026-11', 180000],
          ],
          { description: 'Aluguel', dueDay: 10 },
        ),
        budgetLines[1],
        makeLine(301, 3, [
          ['2026-11', 15050],
          ['2026-12', 30000],
        ]),
        budgetLines[3],
      ]
      fetchLinesMock.mockResolvedValue(saved)
      fetchEntriesMock.mockResolvedValue(entriesOf(saved))
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

      expect(savePlanMock).toHaveBeenCalledWith({
        cells: [
          { anchorId: 101, month: '2026-10', amountCents: 200000 },
          { anchorId: 301, month: '2026-11', amountCents: 15050 },
        ],
      })
      await waitFor(() =>
        expect(screen.queryByRole('region', { name: 'Alterações não salvas' })).not.toBeInTheDocument(),
      )
      expect(cell(ALUGUEL_OUT)).toHaveValue('2.000,00')
      expect(cell(ALUGUEL_OUT).closest('[data-changed]')).toBeNull()
      expect(fetchSummaryMock).toHaveBeenCalledTimes(2)
    }, 15_000)

    it('keeps the draft and shows the error when saving fails', async () => {
      savePlanMock.mockRejectedValue(new ApiError(404, ['Transaction not found']))
      await openDashboard('Moradia')
      await typeInCell(ALUGUEL_OUT, '10')

      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Não foi possível salvar: algum item não existe mais. Atualize a página.',
      )
      expect(cell(ALUGUEL_OUT)).toHaveValue('10,00')
      expect(screen.getByRole('region', { name: 'Alterações não salvas' })).toBeInTheDocument()
    })

    it('discards every unsaved change', async () => {
      await openDashboard('Moradia', 'Lazer')
      await typeInCell(ALUGUEL_OUT, '10')
      await typeInCell('Sem descrição em outubro de 2026', '20')

      await userEvent.click(screen.getByRole('button', { name: 'Descartar' }))

      expect(cell(ALUGUEL_OUT)).toHaveValue('1.800,00')
      expect(cell('Sem descrição em outubro de 2026')).toHaveValue('')
      expect(screen.queryByRole('region', { name: 'Alterações não salvas' })).not.toBeInTheDocument()
    })

    it('Esc reverts the cell and invalid text is ignored', async () => {
      await openDashboard('Moradia')

      await userEvent.click(cell(ALUGUEL_OUT))
      await userEvent.clear(cell(ALUGUEL_OUT))
      await userEvent.type(cell(ALUGUEL_OUT), '999{Escape}')
      expect(cell(ALUGUEL_OUT)).toHaveValue('1.800,00')

      await userEvent.click(cell(ALUGUEL_OUT))
      await userEvent.type(cell(ALUGUEL_OUT), 'abc')
      expect(cell(ALUGUEL_OUT)).toHaveAttribute('aria-invalid', 'true')
      await userEvent.tab()
      expect(cell(ALUGUEL_OUT)).toHaveValue('1.800,00')

      expect(screen.queryByRole('region', { name: 'Alterações não salvas' })).not.toBeInTheDocument()
    })

    it('Enter commits and moves to the launch below; emptying a month deletes it', async () => {
      await openDashboard('Moradia', 'Alimentação')

      await userEvent.click(cell(ALUGUEL_OUT))
      await userEvent.clear(cell(ALUGUEL_OUT))
      await userEvent.keyboard('{Enter}')

      expect(cell('Mercado em outubro de 2026')).toHaveFocus()
      expect(cell(ALUGUEL_OUT)).toHaveValue('')
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
      expect(savePlanMock).toHaveBeenCalledWith({ cells: [{ anchorId: 101, month: '2026-10', amountCents: 0 }] })
    })

    it('replicates a value to every following month from the cell menu', async () => {
      await openDashboard('Moradia')

      await cellAction(ALUGUEL_OUT, 'Replicar para os meses seguintes')

      for (const month of ['novembro de 2026', 'dezembro de 2026', 'janeiro de 2027', 'setembro de 2027']) {
        expect(cell(`Aluguel em ${month}`)).toHaveValue('1.800,00')
      }
      // November already had 1.800,00 saved, so 10 months changed
      expect(screen.getByRole('region', { name: 'Alterações não salvas' })).toHaveTextContent('10 alterações não salvas')
    })

    it('replicates only until December', async () => {
      await openDashboard('Alimentação')
      await typeInCell('Mercado em outubro de 2026', '800')

      await cellAction('Mercado em outubro de 2026', 'Replicar até dezembro')

      expect(cell('Mercado em novembro de 2026')).toHaveValue('800,00')
      expect(cell('Mercado em dezembro de 2026')).toHaveValue('800,00')
      expect(cell('Mercado em janeiro de 2027')).toHaveValue('')
    })

    it('offers only the actions that make sense for the cell', async () => {
      await openDashboard('Lazer')

      await userEvent.click(screen.getByRole('button', { name: 'Ações de Sem descrição em dezembro de 2026' }))
      let menu = await screen.findByRole('menu')
      expect(within(menu).queryByRole('menuitem', { name: 'Replicar até dezembro' })).not.toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Limpar valor' })).not.toHaveAttribute('aria-disabled')
      await userEvent.keyboard('{Escape}')

      await userEvent.click(screen.getByRole('button', { name: 'Ações de Sem descrição em setembro de 2027' }))
      menu = await screen.findByRole('menu')
      expect(within(menu).getByRole('menuitem', { name: 'Replicar para os meses seguintes' })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
      expect(within(menu).getByRole('menuitem', { name: 'Limpar valor' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('clears a month from its menu', async () => {
      await openDashboard('Moradia')

      await cellAction(ALUGUEL_OUT, 'Limpar valor')

      expect(cell(ALUGUEL_OUT)).toHaveValue('')
      expect(rowCells('Despesas')[0]).toBe('R$ 700,00')
    })

    it('plans a new expense in a category, saved with the grid', async () => {
      await openDashboard('Lazer')

      await userEvent.click(screen.getByRole('button', { name: 'Novo lançamento em Lazer' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nova despesa' })
      expect(within(dialog).getByRole('combobox', { name: 'Categoria' })).toHaveDisplayValue('Lazer')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Descrição (opcional)' }), 'Netflix')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Valor previsto (R$)' }), '55,90')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Dia de vencimento (opcional)' }), '5')
      await userEvent.selectOptions(within(dialog).getByLabelText('Repetir'), 'Por alguns meses')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      // Only in the plan: shown in every month of the window, nothing sent yet
      expect(createTransaction).not.toHaveBeenCalled()
      const row = screen.getByRole('rowheader', { name: 'Netflix' })
      expect(row).toHaveTextContent('Vence dia 5')
      expect(row).toHaveTextContent('Não salvo')
      expect(cell('Netflix em outubro de 2026')).toHaveValue('55,90')
      expect(cell('Netflix em setembro de 2027')).toHaveValue('55,90')
      expect(rowCells('Lazer')[0]).toBe('R$ 55,90')
      expect(screen.getByRole('region', { name: 'Alterações não salvas' })).toHaveTextContent('1 alteração não salva')

      // A value typed on the new launch goes with it
      await typeInCell('Netflix em novembro de 2026', '60')
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

      expect(savePlanMock).toHaveBeenCalledWith({
        createLines: [
          {
            ref: -1,
            categoryId: 3,
            description: 'Netflix',
            plannedCents: 5590,
            month: '2026-10',
            repeatMonths: 12,
            dueDay: 5,
          },
        ],
        cells: [{ anchorId: -1, month: '2026-11', amountCents: 6000 }],
      })
      await waitFor(() =>
        expect(screen.queryByRole('region', { name: 'Alterações não salvas' })).not.toBeInTheDocument(),
      )
    })

    it('plans an open-ended launch with a scheduled adjustment', async () => {
      await openDashboard('Lazer')

      await userEvent.click(screen.getByRole('button', { name: 'Novo lançamento em Lazer' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nova despesa' })
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Descrição (opcional)' }), 'Academia')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Valor previsto (R$)' }), '100')
      await userEvent.selectOptions(within(dialog).getByLabelText('Repetir'), 'Todo mês, sem data de término')
      await userEvent.click(within(dialog).getByRole('switch', { name: 'Reajuste automático' }))
      await userEvent.type(within(dialog).getByLabelText('Percentual (%)'), '10')
      const every = within(dialog).getByLabelText('A cada (meses)')
      await userEvent.clear(every)
      await userEvent.type(every, '6')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      // The draft already shows the raise, 6 months after the start
      expect(cell('Academia em março de 2027')).toHaveValue('100,00')
      expect(cell('Academia em abril de 2027')).toHaveValue('110,00')
      expect(cell('Academia em setembro de 2027')).toHaveValue('110,00')
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

      expect(savePlanMock).toHaveBeenCalledWith({
        createLines: [
          {
            ref: -1,
            categoryId: 3,
            description: 'Academia',
            plannedCents: 10000,
            month: '2026-10',
            openEnded: true,
            adjustment: { percentBp: 1000, everyMonths: 6 },
          },
        ],
      })
    })

    it('edits and deletes a launch that is not saved yet', async () => {
      await openDashboard('Lazer')
      await userEvent.click(screen.getByRole('button', { name: 'Novo lançamento em Lazer' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nova despesa' })
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Descrição (opcional)' }), 'Cinema')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Valor previsto (R$)' }), '40')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      // Not in the statement yet
      await userEvent.click(screen.getByRole('button', { name: 'Opções de Cinema' }))
      expect(screen.queryByRole('menuitem', { name: 'Ver no extrato' })).not.toBeInTheDocument()
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar' }))
      const edit = await screen.findByRole('dialog', { name: 'Editar lançamento' })
      const amount = within(edit).getByRole('textbox', { name: 'Valor previsto (R$)' })
      await userEvent.clear(amount)
      await userEvent.type(amount, '45')
      await userEvent.click(within(edit).getByRole('button', { name: 'Salvar' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(cell('Cinema em outubro de 2026')).toHaveValue('45,00')

      await rowAction('Cinema', 'Excluir')
      await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }))

      await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'Cinema' })).not.toBeInTheDocument())
      expect(screen.queryByRole('region', { name: 'Alterações não salvas' })).not.toBeInTheDocument()
    })

    it('also launches from the category menu', async () => {
      await openDashboard()

      await rowAction('Alimentação', 'Novo lançamento')

      const dialog = await screen.findByRole('dialog', { name: 'Nova despesa' })
      expect(within(dialog).getByRole('combobox', { name: 'Categoria' })).toHaveDisplayValue('Alimentação')
    })

    it('rejects an invalid due day', async () => {
      await openDashboard('Lazer')
      await userEvent.click(screen.getByRole('button', { name: 'Novo lançamento em Lazer' }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Valor previsto (R$)' }), '10')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Dia de vencimento (opcional)' }), '32')

      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      expect(within(dialog).getByText('Informe um dia entre 1 e 31.')).toBeInTheDocument()
      expect(createTransaction).not.toHaveBeenCalled()
    })

    it('edits a launch from its first pending month on', async () => {
      await openDashboard('Moradia')

      await rowAction('Aluguel', 'Editar')
      const dialog = await screen.findByRole('dialog', { name: 'Editar lançamento' })
      expect(dialog).toHaveTextContent('Vale de outubro de 2026 em diante')
      const day = within(dialog).getByRole('textbox', { name: 'Dia de vencimento (opcional)' })
      expect(day).toHaveValue('10')
      await userEvent.clear(day)
      await userEvent.type(day, '15')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(updateTransaction).not.toHaveBeenCalled()
      const row = screen.getByRole('rowheader', { name: 'Aluguel' })
      expect(row).toHaveTextContent('Vence dia 15')
      expect(row).toHaveTextContent('Não salvo')

      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
      expect(savePlanMock).toHaveBeenCalledWith({ updateLines: [{ transactionId: 101, dueDay: 15 }] })
    })

    it('changes the amount of a launch from its first pending month on, dropping typed values', async () => {
      const [rent, ...others] = budgetLines
      stubBudgetApi({
        lines: [{ ...rent, cells: [{ ...rent.cells[0], realizedCents: 180000 }, rent.cells[1]] }, ...others],
      })
      await openDashboard('Moradia')
      await typeInCell('Aluguel em novembro de 2026', '1.900')

      await rowAction('Aluguel', 'Editar')
      const dialog = await screen.findByRole('dialog', { name: 'Editar lançamento' })
      const amount = within(dialog).getByRole('textbox', { name: 'Valor previsto (R$)' })
      await userEvent.clear(amount)
      await userEvent.type(amount, '2.000')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      // October is realized and stays; November takes the new amount
      expect(screen.getByRole('link', { name: `${ALUGUEL_OUT}, realizado, ver no extrato` })).toHaveTextContent('1.800,00')
      expect(cell('Aluguel em novembro de 2026')).toHaveValue('2.000,00')
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
      expect(savePlanMock).toHaveBeenCalledWith({ updateLines: [{ transactionId: 102, plannedCents: 200000 }] })
    })

    it('starts editing after the realized months', async () => {
      const [rent, ...others] = budgetLines
      stubBudgetApi({
        lines: [{ ...rent, cells: [{ ...rent.cells[0], realizedCents: 180000 }, rent.cells[1]] }, ...others],
      })
      await openDashboard('Moradia')

      await rowAction('Aluguel', 'Editar')
      const dialog = await screen.findByRole('dialog', { name: 'Editar lançamento' })
      expect(dialog).toHaveTextContent('Vale de novembro de 2026 em diante')
      await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Descrição (opcional)' }))
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Descrição (opcional)' }), 'Aluguel novo')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
      expect(savePlanMock).toHaveBeenCalledWith({ updateLines: [{ transactionId: 102, description: 'Aluguel novo' }] })
    })

    it('deletes a launch from its first pending month on, after confirming', async () => {
      await openDashboard('Moradia')

      await rowAction('Aluguel', 'Excluir')
      const dialog = await screen.findByRole('alertdialog', { name: 'Excluir lançamento' })
      expect(dialog).toHaveTextContent('Excluir Aluguel de outubro de 2026 em diante?')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }))

      await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'Aluguel' })).not.toBeInTheDocument())
      expect(deleteTransaction).not.toHaveBeenCalled()
      expect(rowCells('Moradia')[0]).toBe('R$ 0,00')
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
      expect(savePlanMock).toHaveBeenCalledWith({ deleteLines: [101] })
    })

    it('shows the realized amount of a realized month, read-only, linking to the statement', async () => {
      const [, ...others] = budgetLines
      const rent = makeLine(
        101,
        1,
        [
          ['2026-10', 180000, 175000],
          ['2026-11', 180000],
        ],
        { description: 'Aluguel', dueDay: 10 },
      )
      stubBudgetApi({ lines: [rent, ...others] })
      const { router } = await openDashboard('Moradia')

      // The realized 1.750,00 replaces the planned 1.800,00 in every total
      expect(rowCells('Moradia').slice(0, 2)).toEqual(['R$ 1.750,00', 'R$ 1.800,00'])
      expect(rowCells('Despesas')[0]).toBe('R$ 2.450,00')
      expect(rowCells('Saldo do mês')[0]).toBe('R$ 2.550,00')
      expect(rowCells('Aluguel').at(-1)).toBe('R$ 3.550,00')
      expect(screen.queryByRole('textbox', { name: ALUGUEL_OUT })).not.toBeInTheDocument()
      expect(cell('Aluguel em novembro de 2026')).toHaveValue('1.800,00')

      await userEvent.click(screen.getByRole('link', { name: `${ALUGUEL_OUT}, realizado, ver no extrato` }))
      await waitFor(() => expect(router.state.location.href).toBe('/extrato?month=2026-10'))
    })

    it('replicates over the following months but keeps the realized ones', async () => {
      const [, ...others] = budgetLines
      const rent = makeLine(
        101,
        1,
        [
          ['2026-10', 180000],
          ['2026-11', 180000, 175000],
        ],
        { description: 'Aluguel', dueDay: 10 },
      )
      stubBudgetApi({ lines: [rent, ...others] })
      await openDashboard('Moradia')
      await typeInCell(ALUGUEL_OUT, '2000')

      await cellAction(ALUGUEL_OUT, 'Replicar para os meses seguintes')

      expect(screen.getByRole('link', { name: 'Aluguel em novembro de 2026, realizado, ver no extrato' })).toHaveTextContent(
        '1.750,00',
      )
      expect(cell('Aluguel em dezembro de 2026')).toHaveValue('2.000,00')
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
      await waitFor(() => expect(savePlanMock).toHaveBeenCalled())
      const { cells } = savePlanMock.mock.calls[0][0]
      expect(cells).not.toContainEqual(expect.objectContaining({ month: '2026-11' }))
      expect(cells).toHaveLength(11)
    })

    it('opens a launch in the statement', async () => {
      const { router } = await openDashboard('Lazer')

      await rowAction('Sem descrição', 'Ver no extrato')

      await waitFor(() => expect(router.state.location.href).toBe('/extrato?month=2026-12'))
    })

    it('asks before leaving the page with unsaved changes', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const { router } = await openDashboard('Moradia')
      await typeInCell(ALUGUEL_OUT, '10')

      await openUserMenu()
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar perfil' }))

      expect(confirm).toHaveBeenCalledWith(UNSAVED_CHANGES_MESSAGE)
      expect(router.state.location.pathname).toBe('/')
      expect(cell(ALUGUEL_OUT)).toHaveValue('10,00')

      confirm.mockReturnValue(true)
      await openUserMenu()
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar perfil' }))
      expect(await screen.findByRole('heading', { name: 'Editar perfil' })).toBeInTheDocument()
      confirm.mockRestore()
    })

    it('does not ask before leaving without changes', async () => {
      const confirm = vi.spyOn(window, 'confirm')
      await openDashboard()

      await openUserMenu()
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Alterar senha' }))

      expect(await screen.findByRole('heading', { name: 'Alterar senha' })).toBeInTheDocument()
      expect(confirm).not.toHaveBeenCalled()
      confirm.mockRestore()
    })
  })

  it('shows an error with a retry when the budget fails to load', async () => {
    fetchCategoriesMock.mockRejectedValue(new ApiError(500, ['Internal server error']))
    await renderRoute('/')

    expect(await screen.findByText('Não foi possível carregar o dashboard')).toBeInTheDocument()
    // The layout stays, so the user can still navigate or sign out
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument()

    stubBudgetApi()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  describe('side menu', () => {
    it('shows the user avatar, name and e-mail at the bottom', async () => {
      await renderRoute('/')

      const account = await screen.findByRole('button', { name: 'Menu da conta de Ana Souza' })
      expect(within(account).getByText('AS')).toBeInTheDocument()
      expect(within(account).getByText('Ana Souza')).toBeInTheDocument()
      expect(within(account).getByText('ana@example.com')).toBeInTheDocument()
    })

    it('collapses and expands, remembering the choice', async () => {
      await renderRoute('/')
      const sidebar = () => document.querySelector('[data-slot="sidebar"]')
      expect(sidebar()).toHaveAttribute('data-state', 'expanded')

      const toggle = screen.getByRole('button', { name: 'Alternar menu lateral' })
      await userEvent.click(toggle)
      expect(sidebar()).toHaveAttribute('data-state', 'collapsed')
      expect(sidebar()).toHaveAttribute('data-collapsible', 'icon')
      expect(document.cookie).toContain('sidebar_state=false')

      await userEvent.click(toggle)
      expect(sidebar()).toHaveAttribute('data-state', 'expanded')
      expect(document.cookie).toContain('sidebar_state=true')
    })

    it('starts collapsed when it was collapsed before', async () => {
      document.cookie = 'sidebar_state=false; path=/'

      await renderRoute('/')

      expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute('data-state', 'collapsed')
    })

    it('opens the account menu with the profile, password and sign-out options', async () => {
      await renderRoute('/')

      await openUserMenu()

      const menu = await screen.findByRole('menu')
      expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'Editar perfil',
        'Alterar senha',
        'Sair',
      ])
    })

    it.each([
      ['Editar perfil', '/settings/profile'],
      ['Alterar senha', '/settings/password'],
    ])('"%s" opens %s', async (option, path) => {
      const { router } = await renderRoute('/')

      await openUserMenu()
      await userEvent.click(await screen.findByRole('menuitem', { name: option }))

      expect(await screen.findByRole('heading', { name: option })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe(path)
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  describe('access control', () => {
    it('redirects signed-out visitors to /login and never renders the page', async () => {
      fetchMeMock.mockRejectedValue(unauthorized)

      const { router } = await renderRoute('/')

      expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(router.state.location.search).toEqual({ redirect: '/' })
      expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument()
    })

    it.each([
      ['API offline (proxy 502)', new ApiError(502, ['Bad Gateway'])],
      ['auth routes not deployed (404)', new ApiError(404, ['Cannot GET /auth/me'])],
      ['network error', new ApiError(0, ['Network Error'])],
    ])('treats a failed session check as signed out: %s', async (_, error) => {
      fetchMeMock.mockRejectedValue(error)

      const { router } = await renderRoute('/')

      expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument()
    })

    it('signs out from the account menu, drops cached data and goes back to /login', async () => {
      logoutMock.mockResolvedValue()
      const { router, queryClient } = await renderRoute('/')
      await screen.findByRole('heading', { name: 'Dashboard' })

      fetchMeMock.mockRejectedValue(unauthorized)
      await openUserMenu()
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }))

      expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
      expect(logoutMock).toHaveBeenCalled()
      expect(router.state.location.pathname).toBe('/login')
      expect(queryClient.getQueryData(['auth', 'me'])).toBeUndefined()
    })

    it('still signs out locally when the logout request fails', async () => {
      logoutMock.mockRejectedValue(new ApiError(0, ['Network Error']))
      const { router } = await renderRoute('/')

      fetchMeMock.mockRejectedValue(unauthorized)
      await openUserMenu()
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }))

      expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
    })
  })
})
