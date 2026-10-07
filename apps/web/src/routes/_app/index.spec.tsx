import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe, logout } from '@/features/auth/api'
import {
  fetchCategories,
  fetchEntries,
  fetchSummary,
  saveEntries,
  updateInitialBalance,
} from '@/features/budget/api'
import { UNSAVED_CHANGES_MESSAGE } from '@/features/budget/hooks'
import { ApiError } from '@/lib/api/client'
import { budgetEntries, budgetSummary, stubBudgetApi } from '@/test/budget'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/budget/api')

const fetchMeMock = vi.mocked(fetchMe)
const logoutMock = vi.mocked(logout)
const fetchCategoriesMock = vi.mocked(fetchCategories)
const fetchEntriesMock = vi.mocked(fetchEntries)
const fetchSummaryMock = vi.mocked(fetchSummary)
const saveEntriesMock = vi.mocked(saveEntries)
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
const MORADIA_OUT = 'Moradia em outubro de 2026'

async function openDashboard() {
  const result = await renderRoute('/')
  await screen.findByRole('heading', { name: 'Dashboard' })
  return result
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
    fetchMeMock.mockResolvedValue({ id: 1, name: 'Ana Souza', email: 'ana@example.com' })
    stubBudgetApi()
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

      await typeInCell(MORADIA_OUT, '2.000')
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
    it('shows the current month and the next 11, Despesas before Receitas', async () => {
      await openDashboard()

      expect(fetchEntriesMock).toHaveBeenCalledWith('2026-10', '2027-09')
      const table = screen.getByRole('table', { name: 'Planejamento mensal' })
      const headers = within(table).getAllByRole('columnheader')
      expect(headers).toHaveLength(14)
      expect(headers[1]).toHaveAccessibleName('outubro de 2026')
      expect(headers[1]).toHaveTextContent(/^out\/26\s*\(atual\)$/)
      expect(headers[12]).toHaveAccessibleName('setembro de 2027')
      expect(headers[13]).toHaveTextContent('Total')

      const sections = within(table)
        .getAllByRole('rowheader')
        .map((h) => h.textContent)
      expect(sections.indexOf('Despesas')).toBeLessThan(sections.indexOf('Receitas'))
      expect(sections).toEqual([
        'Despesas', 'Despesas Básicas', 'Moradia', 'Alimentação', 'Custos de Vida', 'Lazer',
        'Receitas', 'Salário', 'Salário', 'Renda Extra', 'Renda extra',
        'Saldo do mês', 'Saldo acumulado',
      ])
    })

    it('sums categories into types and sections, and projects the balance', async () => {
      await openDashboard()

      expect(cell(MORADIA_OUT)).toHaveValue('1.800,00')
      expect(cell('Lazer em outubro de 2026')).toHaveValue('')
      expect(rowCells('Despesas').slice(0, 3)).toEqual(['R$ 2.500,00', 'R$ 1.800,00', 'R$ 300,00'])
      expect(rowCells('Receitas').slice(0, 2)).toEqual(['R$ 5.000,00', 'R$ 0,00'])
      expect(rowCells('Saldo do mês').slice(0, 3)).toEqual(['R$ 2.500,00', '-R$ 1.800,00', '-R$ 300,00'])
      // Opening 2.500 + 2.500, then − 1.800, then − 300
      expect(rowCells('Saldo acumulado').slice(0, 3)).toEqual(['R$ 5.000,00', 'R$ 3.200,00', 'R$ 2.900,00'])
    })

    it('totals every row of the window in the last column', async () => {
      await openDashboard()

      // Moradia 1.800 + 1.800; Despesas 2.500 + 1.800 + 300
      expect(rowCells('Moradia').at(-1)).toBe('R$ 3.600,00')
      expect(rowCells('Despesas Básicas').at(-1)).toBe('R$ 4.300,00')
      expect(rowCells('Despesas').at(-1)).toBe('R$ 4.600,00')
      expect(rowCells('Receitas').at(-1)).toBe('R$ 5.000,00')
      expect(rowCells('Saldo do mês').at(-1)).toBe('R$ 400,00')
      // Closing balance of the window: opening 2.500 + 400
      expect(rowCells('Saldo acumulado').at(-1)).toBe('R$ 2.900,00')

      await typeInCell('Lazer em janeiro de 2027', '100')
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

    it('edits a cell, updating totals and cards before saving', async () => {
      await openDashboard()

      await typeInCell(MORADIA_OUT, '2.000')

      expect(cell(MORADIA_OUT)).toHaveValue('2.000,00')
      expect(cell(MORADIA_OUT).closest('[data-changed]')).not.toBeNull()
      expect(rowCells('Despesas')[0]).toBe('R$ 2.700,00')
      expect(within(card('Despesas do mês')).getByText(/2\.700,00/)).toBeInTheDocument()
      expect(within(card('Saldo acumulado')).getByText(/4\.800,00/)).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Alterações não salvas' })).toHaveTextContent('1 alteração não salva')
      expect(saveEntriesMock).not.toHaveBeenCalled()
    })

    it('saves only the changed cells and clears the draft', async () => {
      await openDashboard()
      await typeInCell(MORADIA_OUT, '2000')
      await typeInCell('Lazer em novembro de 2026', '150,5')
      // Typing the saved value back is not a change
      await typeInCell('Salário em outubro de 2026', '5.000,00')

      fetchEntriesMock.mockResolvedValue([
        ...budgetEntries.filter((e) => !(e.categoryId === 1 && e.month === '2026-10')),
        { categoryId: 1, month: '2026-10', amountCents: 200000 },
        { categoryId: 3, month: '2026-11', amountCents: 15050 },
      ])
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

      expect(saveEntriesMock).toHaveBeenCalledWith([
        { categoryId: 1, month: '2026-10', amountCents: 200000 },
        { categoryId: 3, month: '2026-11', amountCents: 15050 },
      ])
      await waitFor(() =>
        expect(screen.queryByRole('region', { name: 'Alterações não salvas' })).not.toBeInTheDocument(),
      )
      expect(cell(MORADIA_OUT)).toHaveValue('2.000,00')
      expect(cell(MORADIA_OUT).closest('[data-changed]')).toBeNull()
      expect(fetchSummaryMock).toHaveBeenCalledTimes(2)
    })

    it('keeps the draft and shows the error when saving fails', async () => {
      saveEntriesMock.mockRejectedValue(new ApiError(404, ['Category not found']))
      await openDashboard()
      await typeInCell(MORADIA_OUT, '10')

      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar: Category not found')
      expect(cell(MORADIA_OUT)).toHaveValue('10,00')
      expect(screen.getByRole('region', { name: 'Alterações não salvas' })).toBeInTheDocument()
    })

    it('discards every unsaved change', async () => {
      await openDashboard()
      await typeInCell(MORADIA_OUT, '10')
      await typeInCell('Lazer em outubro de 2026', '20')

      await userEvent.click(screen.getByRole('button', { name: 'Descartar' }))

      expect(cell(MORADIA_OUT)).toHaveValue('1.800,00')
      expect(cell('Lazer em outubro de 2026')).toHaveValue('')
      expect(screen.queryByRole('region', { name: 'Alterações não salvas' })).not.toBeInTheDocument()
    })

    it('Esc reverts the cell and invalid text is ignored', async () => {
      await openDashboard()

      await userEvent.click(cell(MORADIA_OUT))
      await userEvent.clear(cell(MORADIA_OUT))
      await userEvent.type(cell(MORADIA_OUT), '999{Escape}')
      expect(cell(MORADIA_OUT)).toHaveValue('1.800,00')

      await userEvent.click(cell(MORADIA_OUT))
      await userEvent.type(cell(MORADIA_OUT), 'abc')
      expect(cell(MORADIA_OUT)).toHaveAttribute('aria-invalid', 'true')
      await userEvent.tab()
      expect(cell(MORADIA_OUT)).toHaveValue('1.800,00')

      expect(screen.queryByRole('region', { name: 'Alterações não salvas' })).not.toBeInTheDocument()
    })

    it('Enter commits and moves to the cell below; emptying a cell clears it', async () => {
      await openDashboard()

      await userEvent.click(cell(MORADIA_OUT))
      await userEvent.clear(cell(MORADIA_OUT))
      await userEvent.keyboard('{Enter}')

      expect(cell('Alimentação em outubro de 2026')).toHaveFocus()
      expect(cell(MORADIA_OUT)).toHaveValue('')
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
      expect(saveEntriesMock).toHaveBeenCalledWith([{ categoryId: 1, month: '2026-10', amountCents: 0 }])
    })

    it('replicates a value to every following month from the cell menu', async () => {
      await openDashboard()

      await cellAction(MORADIA_OUT, 'Replicar para os meses seguintes')

      for (const month of ['novembro de 2026', 'dezembro de 2026', 'janeiro de 2027', 'setembro de 2027']) {
        expect(cell(`Moradia em ${month}`)).toHaveValue('1.800,00')
      }
      // November already had 1.800,00 saved, so 10 cells changed
      expect(screen.getByRole('region', { name: 'Alterações não salvas' })).toHaveTextContent('10 alterações não salvas')
    })

    it('shows cells with several transactions read-only, linking to the statement, and skips them when replicating', async () => {
      stubBudgetApi({
        entries: [
          ...budgetEntries.filter((e) => !(e.categoryId === 1 && e.month === '2026-11')),
          { categoryId: 1, month: '2026-11', amountCents: 200000, count: 2 },
        ],
      })
      await openDashboard()

      expect(screen.queryByRole('textbox', { name: 'Moradia em novembro de 2026' })).not.toBeInTheDocument()
      const link = screen.getByRole('link', {
        name: 'Moradia em novembro de 2026: vários lançamentos, editar no extrato',
      })
      expect(link).toHaveTextContent('R$ 2.000,00')
      expect(link).toHaveAttribute('href', '/extrato?month=2026-11')

      await cellAction(MORADIA_OUT, 'Replicar para os meses seguintes')
      expect(cell('Moradia em dezembro de 2026')).toHaveValue('1.800,00')
      expect(link).toHaveTextContent('R$ 2.000,00')
      // December to September: 10 cells, November left out
      expect(screen.getByRole('region', { name: 'Alterações não salvas' })).toHaveTextContent('10 alterações não salvas')
    })

    it('replicates only until December', async () => {
      await openDashboard()
      await typeInCell('Alimentação em outubro de 2026', '800')

      await cellAction('Alimentação em outubro de 2026', 'Replicar até dezembro')

      expect(cell('Alimentação em novembro de 2026')).toHaveValue('800,00')
      expect(cell('Alimentação em dezembro de 2026')).toHaveValue('800,00')
      expect(cell('Alimentação em janeiro de 2027')).toHaveValue('')
    })

    it('offers only the actions that make sense for the cell', async () => {
      await openDashboard()

      await userEvent.click(screen.getByRole('button', { name: 'Ações de Lazer em dezembro de 2026' }))
      let menu = await screen.findByRole('menu')
      expect(within(menu).queryByRole('menuitem', { name: 'Replicar até dezembro' })).not.toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Limpar valor' })).not.toHaveAttribute('aria-disabled')
      await userEvent.keyboard('{Escape}')

      await userEvent.click(screen.getByRole('button', { name: 'Ações de Lazer em setembro de 2027' }))
      menu = await screen.findByRole('menu')
      expect(within(menu).getByRole('menuitem', { name: 'Replicar para os meses seguintes' })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
      expect(within(menu).getByRole('menuitem', { name: 'Limpar valor' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('clears a cell from its menu', async () => {
      await openDashboard()

      await cellAction(MORADIA_OUT, 'Limpar valor')

      expect(cell(MORADIA_OUT)).toHaveValue('')
      expect(rowCells('Despesas')[0]).toBe('R$ 700,00')
    })

    it('asks before leaving the page with unsaved changes', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const { router } = await openDashboard()
      await typeInCell(MORADIA_OUT, '10')

      await openUserMenu()
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar perfil' }))

      expect(confirm).toHaveBeenCalledWith(UNSAVED_CHANGES_MESSAGE)
      expect(router.state.location.pathname).toBe('/')
      expect(cell(MORADIA_OUT)).toHaveValue('10,00')

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
