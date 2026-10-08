import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import {
  createCategory,
  createGroup,
  deleteCategory,
  fetchCategories,
  fetchSummary,
  updateCategory,
  updateGroup,
  updateInitialBalance,
} from '@/features/budget/api'
import {
  createTransaction,
  deleteTransaction,
  fetchTransactions,
  realizeTransaction,
  setTransactionSeriesEnd,
  unrealizeTransaction,
  updateTransaction,
} from '@/features/transactions/api'
import { ApiError } from '@/lib/api/client'
import { budgetGroups, budgetSummary, stubBudgetApi } from '@/test/budget'
import { makeAuthUser } from '@/test/auth'
import { renderRoute } from '@/test/render'
import { categories, makeTransaction, octoberTransactions, stubTransactionsApi } from '@/test/transactions'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/budget/api')
vi.mock('@/features/transactions/api')

const fetchTransactionsMock = vi.mocked(fetchTransactions)
const createMock = vi.mocked(createTransaction)
const updateMock = vi.mocked(updateTransaction)
const deleteMock = vi.mocked(deleteTransaction)
const realizeMock = vi.mocked(realizeTransaction)
const unrealizeMock = vi.mocked(unrealizeTransaction)

const region = (title: string) => screen.getByRole('region', { name: title })
const summaryItem = (title: string) => within(region('Resumo do mês')).getByRole('group', { name: title })
const row = (title: string) => screen.getByRole('listitem', { name: title })

async function openStatement(path = '/extrato') {
  const result = await renderRoute(path)
  await screen.findByRole('heading', { name: 'Extrato' })
  return result
}

async function rowAction(title: string, action: string) {
  await userEvent.click(screen.getByRole('button', { name: `Opções de ${title}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: action }))
}

describe('Statement route (/extrato)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Only the date: real timers keep user-event and Radix working
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue(makeAuthUser())
    stubBudgetApi()
    stubTransactionsApi()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('month view', () => {
    it('lists the current month’s incomes and expenses with their totals', async () => {
      await openStatement()

      expect(fetchTransactionsMock).toHaveBeenCalledWith('2026-10')
      expect(vi.mocked(fetchSummary)).toHaveBeenCalledWith('2026-10')
      expect(screen.getByText(/Receitas e despesas de outubro de 2026/)).toBeInTheDocument()
      const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
      expect(within(nav).getByRole('link', { name: 'Extrato' })).toHaveAttribute('data-active', 'true')

      // Receitas above Despesas, each under its types' titles with their subtotals
      expect(region('Receitas').compareDocumentPosition(region('Despesas'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
      const incomes = within(region('Receitas'))
      expect(incomes.getAllByRole('list')).toHaveLength(1)
      expect(
        within(incomes.getByRole('list', { name: 'Salário' }))
          .getAllByRole('listitem')
          .map((li) => li.getAttribute('aria-label')),
      ).toEqual(['Salário'])
      const expenses = within(region('Despesas'))
      const basics = expenses.getByRole('list', { name: 'Despesas Básicas' })
      expect(within(basics).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual([
        'Aluguel',
        'Alimentação',
      ])
      expect(expenses.getByRole('heading', { name: 'Despesas Básicas' }).parentElement).toHaveTextContent(
        'R$ 2.550,00',
      )
      expect(expenses.getByText(/a realizar/)).toHaveTextContent('a realizar R$ 1.800,00')

      // Due day, recurring badge, the category under a description and the realized amount above the planned one
      expect(within(row('Aluguel')).getByText('Vence dia', { exact: false }).parentElement).toHaveTextContent('Vence dia 10')
      expect(within(row('Aluguel')).getByText('1/12')).toBeInTheDocument()
      expect(within(row('Aluguel')).getByText('Moradia')).toBeInTheDocument()
      expect(within(row('Alimentação')).getByRole('button', { name: 'Valor realizado de Alimentação' })).toHaveTextContent(
        'R$ 750,00',
      )
      expect(within(row('Alimentação')).getByText(/Previsto/)).toHaveTextContent('Previsto R$ 700,00')
      expect(within(row('Alimentação')).getByRole('checkbox', { name: 'Realizado: Alimentação' })).toBeChecked()
      expect(within(row('Salário')).getByRole('checkbox', { name: 'Realizado: Salário' })).not.toBeChecked()

      // Realized amounts count; pending ones count as planned
      const expenseSummary = within(summaryItem('Despesas do mês'))
      expect(expenseSummary.getByText('R$ 2.550,00')).toBeInTheDocument()
      expect(expenseSummary.getByText('Realizado R$ 750,00 · a realizar R$ 1.800,00')).toBeInTheDocument()
      expect(within(summaryItem('Receitas do mês')).getByText('R$ 5.000,00')).toBeInTheDocument()
      expect(within(summaryItem('Saldo de abertura')).getByText(/2\.500,00/)).toBeInTheDocument()
      expect(within(summaryItem('Saldo do mês')).getByText(/2\.450,00/)).toBeInTheDocument()
      expect(within(summaryItem('Saldo final')).getByText(/4\.950,00/)).toBeInTheDocument()
    })

    it('separates the expenses by type in the order of the budget tree', async () => {
      const cinema = makeTransaction(4, { category: categories.leisure, description: 'Cinema', plannedCents: 30000 })
      // The server lists by due day, so the leisure one (day 1) comes first
      stubTransactionsApi([cinema, ...octoberTransactions])
      await openStatement()

      const expenses = within(region('Despesas'))
      expect(expenses.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
        'Despesas Básicas',
        'Custos de Vida',
      ])
      const leisure = expenses.getByRole('list', { name: 'Custos de Vida' })
      expect(within(leisure).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['Cinema'])
      expect(expenses.getByRole('heading', { name: 'Custos de Vida' }).parentElement).toHaveTextContent('R$ 300,00')
    })

    it('says when a section has no transactions', async () => {
      stubTransactionsApi([octoberTransactions[1]])
      await openStatement()

      expect(within(region('Receitas')).getByText('Nenhuma receita neste mês.')).toBeInTheDocument()
      expect(within(region('Receitas')).queryByRole('list')).not.toBeInTheDocument()
      expect(within(region('Despesas')).getAllByRole('listitem')).toHaveLength(1)
    })

    it('moves to other months and back to the current one', async () => {
      const { router } = await openStatement()

      await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
      expect(await screen.findByText(/Receitas e despesas de novembro de 2026/)).toBeInTheDocument()
      expect(fetchTransactionsMock).toHaveBeenLastCalledWith('2026-11')
      expect(router.state.location.search).toEqual({ month: '2026-11' })

      await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
      await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
      expect(await screen.findByText(/Receitas e despesas de setembro de 2026/)).toBeInTheDocument()
      expect(fetchTransactionsMock).toHaveBeenLastCalledWith('2026-09')

      await userEvent.click(screen.getByRole('button', { name: 'Mês atual' }))
      expect(await screen.findByText(/Receitas e despesas de outubro de 2026/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Mês atual' })).not.toBeInTheDocument()
    })

    it('opens the month from the address and ignores an invalid one', async () => {
      const { unmount } = await openStatement('/extrato?month=2027-01')
      expect(screen.getByText(/Receitas e despesas de janeiro de 2027/)).toBeInTheDocument()
      expect(fetchTransactionsMock).toHaveBeenCalledWith('2027-01')
      unmount()

      await openStatement('/extrato?month=2027-13')
      expect(screen.getByText(/Receitas e despesas de outubro de 2026/)).toBeInTheDocument()
    })

    it('shows an empty state with the launch buttons for a month without transactions', async () => {
      stubTransactionsApi([])
      await openStatement()

      expect(screen.getByText('Nenhum lançamento neste mês')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Nova despesa' })).toHaveLength(2)
    })

    it('shows an error with a retry when the statement fails to load', async () => {
      fetchTransactionsMock.mockRejectedValueOnce(new Error('offline'))
      await renderRoute('/extrato')

      expect(await screen.findByText('Não foi possível carregar o extrato')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
      expect(await screen.findByRole('heading', { name: 'Extrato' })).toBeInTheDocument()
    })
  })

  describe('realization', () => {
    it('checking marks as realized with the planned amount; unchecking undoes it', async () => {
      await openStatement()

      await userEvent.click(screen.getByRole('checkbox', { name: 'Realizado: Salário' }))
      await waitFor(() => expect(realizeMock).toHaveBeenCalledWith(1, 500000))

      await userEvent.click(screen.getByRole('checkbox', { name: 'Realizado: Alimentação' }))
      await waitFor(() => expect(unrealizeMock).toHaveBeenCalledWith(3))
      // The statement is fetched again
      expect(fetchTransactionsMock.mock.calls.length).toBeGreaterThan(1)
    })

    it('informs a realized amount different from the planned one', async () => {
      await openStatement()

      await rowAction('Salário', 'Informar valor realizado')
      const dialog = await screen.findByRole('dialog', { name: 'Valor realizado' })
      const input = within(dialog).getByLabelText('Valor realizado (R$)')
      expect(input).toHaveValue('5.000,00')

      await userEvent.clear(input)
      await userEvent.type(input, '5.250,50')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Marcar como realizado' }))

      await waitFor(() => expect(realizeMock).toHaveBeenCalledWith(1, 525050))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('edits the realized amount by clicking it, keeping the dialog open on errors', async () => {
      realizeMock.mockRejectedValueOnce(new ApiError(400, ['amountCents must not be less than 0']))
      await openStatement()

      await userEvent.click(screen.getByRole('button', { name: 'Valor realizado de Alimentação' }))
      const dialog = await screen.findByRole('dialog', { name: 'Valor realizado' })
      const input = within(dialog).getByLabelText('Valor realizado (R$)')
      expect(input).toHaveValue('750,00')

      await userEvent.clear(input)
      await userEvent.type(input, 'abc')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Marcar como realizado' }))
      expect(within(dialog).getByText(/Informe um valor válido/)).toBeInTheDocument()
      expect(realizeMock).not.toHaveBeenCalled()

      await userEvent.clear(input)
      await userEvent.type(input, '760')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Marcar como realizado' }))
      expect(await within(dialog).findByText('amountCents must not be less than 0')).toBeInTheDocument()
      expect(realizeMock).toHaveBeenCalledWith(3, 76000)
    })

    it('shows a toast when the check fails', async () => {
      const toastError = vi.spyOn(toast, 'error')
      realizeMock.mockRejectedValueOnce(new ApiError(404, ['Transaction not found']))
      await openStatement()

      await userEvent.click(screen.getByRole('checkbox', { name: 'Realizado: Salário' }))

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith('Lançamento não encontrado. Atualize a página.'),
      )
    })
  })

  describe('launching', () => {
    it('launches an expense repeated for the next 12 months', async () => {
      await openStatement()

      await userEvent.click(screen.getByRole('button', { name: 'Nova despesa' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nova despesa' })
      const select = within(dialog).getByRole('combobox', { name: 'Categoria' })
      // Only active expense categories, grouped by type
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Selecione…',
        'Moradia',
        'Alimentação',
        'Lazer',
      ])

      await userEvent.selectOptions(select, 'Lazer')
      await userEvent.type(within(dialog).getByLabelText('Descrição (opcional)'), 'Cinema')
      await userEvent.type(within(dialog).getByLabelText('Valor previsto (R$)'), '150')
      await userEvent.click(within(dialog).getByRole('switch', { name: 'Repetir nos próximos meses' }))
      expect(within(dialog).getByLabelText('Quantidade de meses')).toHaveValue('12')
      expect(within(dialog).getByText('De out/26 a set/27, contando este mês.')).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      await waitFor(() =>
        expect(createMock).toHaveBeenCalledWith({
          categoryId: 3,
          description: 'Cinema',
          plannedCents: 15000,
          month: '2026-10',
          repeatMonths: 12,
        }),
      )
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('launches a single income in the month being viewed', async () => {
      await openStatement('/extrato?month=2026-12')

      await userEvent.click(screen.getByRole('button', { name: 'Nova receita' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nova receita' })
      expect(within(dialog).getByText('Lançamento previsto para dezembro de 2026.')).toBeInTheDocument()
      const select = within(dialog).getByRole('combobox', { name: 'Categoria' })
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Selecione…',
        'Salário',
        'Renda extra',
      ])

      await userEvent.selectOptions(select, 'Renda extra')
      await userEvent.type(within(dialog).getByLabelText('Valor previsto (R$)'), '1.234,56')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      await waitFor(() =>
        expect(createMock).toHaveBeenCalledWith({
          categoryId: 5,
          description: null,
          plannedCents: 123456,
          month: '2026-12',
        }),
      )
    })

    it('validates the form before calling the API, and shows API errors', async () => {
      createMock.mockRejectedValueOnce(new ApiError(400, ['Category is inactive']))
      await openStatement()

      await userEvent.click(screen.getByRole('button', { name: 'Nova despesa' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nova despesa' })
      await userEvent.click(within(dialog).getByRole('switch', { name: 'Repetir nos próximos meses' }))
      const times = within(dialog).getByLabelText('Quantidade de meses')
      await userEvent.clear(times)
      await userEvent.type(times, '61')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      expect(within(dialog).getByText('Escolha a categoria.')).toBeInTheDocument()
      expect(within(dialog).getByText('Informe um valor maior que zero.')).toBeInTheDocument()
      expect(within(dialog).getByText('Informe de 2 a 60 meses.')).toBeInTheDocument()
      expect(createMock).not.toHaveBeenCalled()

      await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Categoria' }), 'Moradia')
      await userEvent.type(within(dialog).getByLabelText('Valor previsto (R$)'), '10')
      await userEvent.clear(times)
      await userEvent.type(times, '2')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      expect(await within(dialog).findByText('Category is inactive')).toBeInTheDocument()
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 1, repeatMonths: 2 }))
    })
  })

  describe('editing and deleting', () => {
    it('editing a recurring transaction asks about the next ones and can change them too', async () => {
      await openStatement()

      await rowAction('Aluguel', 'Editar')
      const form = await screen.findByRole('dialog', { name: 'Editar lançamento' })
      // No recurrence fields when editing
      expect(within(form).queryByRole('switch')).not.toBeInTheDocument()
      const amount = within(form).getByLabelText('Valor previsto (R$)')
      expect(amount).toHaveValue('1.800,00')
      await userEvent.clear(amount)
      await userEvent.type(amount, '2.000')
      await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }))

      const ask = await screen.findByRole('alertdialog', { name: 'Alterar lançamento recorrente' })
      expect(updateMock).not.toHaveBeenCalled()
      await userEvent.click(within(ask).getByRole('button', { name: 'Alterar também os próximos' }))

      await waitFor(() =>
        expect(updateMock).toHaveBeenCalledWith(
          2,
          { categoryId: 1, description: 'Aluguel', plannedCents: 200000 },
          'FOLLOWING',
        ),
      )
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    })

    it('editing a recurring transaction can keep the next ones', async () => {
      await openStatement()

      await rowAction('Aluguel', 'Editar')
      const form = await screen.findByRole('dialog', { name: 'Editar lançamento' })
      await userEvent.clear(within(form).getByLabelText('Descrição (opcional)'))
      await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }))
      const ask = await screen.findByRole('alertdialog', { name: 'Alterar lançamento recorrente' })
      await userEvent.click(within(ask).getByRole('button', { name: 'Manter os próximos' }))

      await waitFor(() =>
        expect(updateMock).toHaveBeenCalledWith(2, { categoryId: 1, description: null, plannedCents: 180000 }, 'ONE'),
      )
    })

    it('editing a single transaction saves without asking', async () => {
      await openStatement()

      await rowAction('Salário', 'Editar')
      const form = await screen.findByRole('dialog', { name: 'Editar lançamento' })
      await userEvent.type(within(form).getByLabelText('Descrição (opcional)'), 'Empresa X')
      await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }))

      await waitFor(() =>
        expect(updateMock).toHaveBeenCalledWith(1, { categoryId: 4, description: 'Empresa X', plannedCents: 500000 }, 'ONE'),
      )
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('deleting a recurring transaction asks about the next ones and can keep them', async () => {
      await openStatement()

      await rowAction('Aluguel', 'Excluir')
      const ask = await screen.findByRole('alertdialog', { name: 'Excluir lançamento recorrente' })
      // The three long labels are stacked on every screen (they don't fit side by side)
      const footer = within(ask).getByRole('button', { name: 'Cancelar' }).parentElement!
      expect(footer).toHaveClass('sm:flex-col-reverse')
      expect(within(footer).getAllByRole('button').map((b) => b.textContent)).toEqual([
        'Cancelar',
        'Excluir só este',
        'Excluir também os próximos',
      ])
      await userEvent.click(within(ask).getByRole('button', { name: 'Excluir só este' }))

      await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(2, 'ONE'))
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    })

    it('deleting a recurring transaction can delete the next ones too, showing errors', async () => {
      deleteMock.mockRejectedValueOnce(new ApiError(500, ['Internal server error']))
      await openStatement()

      await rowAction('Aluguel', 'Excluir')
      const ask = await screen.findByRole('alertdialog', { name: 'Excluir lançamento recorrente' })
      await userEvent.click(within(ask).getByRole('button', { name: 'Excluir também os próximos' }))
      expect(await within(ask).findByText('Internal server error')).toBeInTheDocument()

      await userEvent.click(within(ask).getByRole('button', { name: 'Excluir também os próximos' }))
      await waitFor(() => expect(deleteMock).toHaveBeenLastCalledWith(2, 'FOLLOWING'))
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    })

    it('deleting a single transaction asks for a plain confirmation', async () => {
      await openStatement()

      await rowAction('Alimentação', 'Excluir')
      const confirm = await screen.findByRole('alertdialog', { name: 'Excluir lançamento' })
      await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }))

      await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(3, 'ONE'))
    })

    it('does not offer editing transactions of an inactive category', async () => {
      const [salary] = (await import('@/test/transactions')).octoberTransactions
      stubTransactionsApi([{ ...salary, category: { ...salary.category, active: false } }])
      await openStatement()

      await userEvent.click(screen.getByRole('button', { name: 'Opções de Salário' }))
      expect(await screen.findByRole('menuitem', { name: 'Excluir' })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'Editar' })).not.toBeInTheDocument()
    })
  })

  describe('due day', () => {
    it('launches with a due day of its own', async () => {
      await openStatement()

      await userEvent.click(screen.getByRole('button', { name: 'Nova despesa' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nova despesa' })
      await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Categoria' }), 'Lazer')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Valor previsto (R$)' }), '40')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Dia de vencimento (opcional)' }), '20')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      await waitFor(() =>
        expect(createMock).toHaveBeenCalledWith({
          categoryId: 3,
          description: null,
          plannedCents: 4000,
          month: '2026-10',
          dueDay: 20,
        }),
      )
    })

    it('edits the due day, sending it only when it changes', async () => {
      await openStatement()

      await rowAction('Alimentação', 'Editar')
      let form = await screen.findByRole('dialog', { name: 'Editar lançamento' })
      const day = within(form).getByRole('textbox', { name: 'Dia de vencimento (opcional)' })
      expect(day).toHaveValue('')
      await userEvent.type(day, '7')
      await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }))
      await waitFor(() =>
        expect(updateMock).toHaveBeenCalledWith(
          3,
          { categoryId: 2, description: null, plannedCents: 70000, dueDay: 7 },
          'ONE',
        ),
      )
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      await rowAction('Salário', 'Editar')
      form = await screen.findByRole('dialog', { name: 'Editar lançamento' })
      expect(within(form).getByRole('textbox', { name: 'Dia de vencimento (opcional)' })).toHaveValue('5')
      await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }))
      await waitFor(() =>
        expect(updateMock).toHaveBeenLastCalledWith(
          1,
          { categoryId: 4, description: null, plannedCents: 500000 },
          'ONE',
        ),
      )
    })
  })

  describe('payment link', () => {
    const bill = 'https://www.banco.com.br/boleto/123'

    it('launches with a link to the bill, adding https:// when missing', async () => {
      await openStatement()

      await userEvent.click(screen.getByRole('button', { name: 'Nova despesa' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nova despesa' })
      await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Categoria' }), 'Lazer')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Valor previsto (R$)' }), '40')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Link de pagamento (opcional)' }), 'www.banco.com.br/boleto/123')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      await waitFor(() =>
        expect(createMock).toHaveBeenCalledWith({
          categoryId: 3,
          description: null,
          plannedCents: 4000,
          month: '2026-10',
          paymentUrl: bill,
        }),
      )
    })

    it('rejects an invalid link before calling the API, and shows the API’s refusal', async () => {
      await openStatement()

      await userEvent.click(screen.getByRole('button', { name: 'Nova despesa' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nova despesa' })
      await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Categoria' }), 'Lazer')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Valor previsto (R$)' }), '40')
      const link = within(dialog).getByRole('textbox', { name: 'Link de pagamento (opcional)' })
      await userEvent.type(link, 'boleto do mês')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      expect(await within(dialog).findByText(/Informe um link válido/)).toBeInTheDocument()
      expect(link).toHaveAttribute('aria-invalid', 'true')
      expect(createMock).not.toHaveBeenCalled()

      createMock.mockRejectedValueOnce(new ApiError(400, ['paymentUrl must be an http(s) URL']))
      await userEvent.clear(link)
      await userEvent.type(link, 'https://banco.com.br/x')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Informe um link válido/)
    })

    it('opens the bill from the row in a new tab', async () => {
      stubTransactionsApi([{ ...octoberTransactions[1], paymentUrl: bill }, octoberTransactions[0]])
      await openStatement()

      const link = await within(await screen.findByRole('listitem', { name: 'Aluguel' })).findByRole('link', {
        name: 'Abrir link de pagamento: Aluguel',
      })
      expect(link).toHaveAttribute('href', bill)
      expect(link).toHaveAttribute('target', '_blank')
      expect(within(row('Salário')).queryByRole('link', { name: /Abrir link de pagamento/ })).not.toBeInTheDocument()
    })

    it('edits the link, sending it only when it changes, and clears it', async () => {
      stubTransactionsApi([{ ...octoberTransactions[0], paymentUrl: bill }, octoberTransactions[2]])
      await openStatement()

      await rowAction('Salário', 'Editar')
      let form = await screen.findByRole('dialog', { name: 'Editar lançamento' })
      const link = within(form).getByRole('textbox', { name: 'Link de pagamento (opcional)' })
      expect(link).toHaveValue(bill)
      await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }))
      await waitFor(() =>
        expect(updateMock).toHaveBeenCalledWith(
          1,
          { categoryId: 4, description: null, plannedCents: 500000 },
          'ONE',
        ),
      )
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      await rowAction('Salário', 'Editar')
      form = await screen.findByRole('dialog', { name: 'Editar lançamento' })
      await userEvent.clear(within(form).getByRole('textbox', { name: 'Link de pagamento (opcional)' }))
      await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }))
      await waitFor(() =>
        expect(updateMock).toHaveBeenLastCalledWith(
          1,
          { categoryId: 4, description: null, plannedCents: 500000, paymentUrl: null },
          'ONE',
        ),
      )
    })
  })

  describe('recurrence range', () => {
    const openRange = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Recorrência de Aluguel: 1 de 12' }))
      return screen.findByRole('dialog', { name: 'Período da recorrência' })
    }

    it('extends a series from its badge', async () => {
      await openStatement()

      const dialog = await openRange()
      expect(dialog).toHaveTextContent('Aluguel: parcela 1 de 12, de out/26 a set/27.')
      expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeDisabled()
      const later = within(dialog).getByRole('button', { name: 'Próximo mês' })
      await userEvent.click(later)
      await userEvent.click(later)
      await userEvent.click(later)
      expect(dialog).toHaveTextContent('dezembro de 2027')
      expect(dialog).toHaveTextContent('15 lançamentos no total')
      expect(within(dialog).getByRole('status')).toHaveTextContent('Serão criados 3 lançamentos')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(setTransactionSeriesEnd).toHaveBeenCalledWith(2, '2027-12')
      // The statement reads it back
      expect(fetchTransactionsMock).toHaveBeenCalledTimes(2)
    })

    it('shortens a series, showing the conflict when a later one was realized', async () => {
      vi.mocked(setTransactionSeriesEnd).mockRejectedValueOnce(
        new ApiError(409, ['An occurrence after untilMonth is already settled']),
      )
      await openStatement()

      const dialog = await openRange()
      const earlier = within(dialog).getByRole('button', { name: 'Mês anterior' })
      for (let i = 0; i < 6; i++) await userEvent.click(earlier)
      expect(dialog).toHaveTextContent('março de 2027')
      expect(within(dialog).getByRole('status')).toHaveTextContent(
        'Os lançamentos pendentes depois de março de 2027 serão excluídos',
      )
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Há lançamentos já realizados depois desse mês')
      expect(setTransactionSeriesEnd).toHaveBeenCalledWith(2, '2027-03')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('never ends before the first month', async () => {
      await openStatement()

      const dialog = await openRange()
      const earlier = within(dialog).getByRole('button', { name: 'Mês anterior' })
      for (let i = 0; i < 11; i++) await userEvent.click(earlier)

      expect(dialog).toHaveTextContent('outubro de 2026')
      expect(dialog).toHaveTextContent('1 lançamento no total')
      expect(earlier).toBeDisabled()
    })
  })

  describe('initial balance', () => {
    it('adjusts the initial balance and refreshes the opening balance', async () => {
      const toastSuccess = vi.spyOn(toast, 'success')
      await openStatement()
      expect(summaryItem('Saldo de abertura')).toHaveTextContent('2.500,00')
      vi.mocked(fetchSummary).mockResolvedValue({ ...budgetSummary, initialBalanceCents: 300000, openingBalanceCents: 450000 })

      await userEvent.click(screen.getByRole('button', { name: 'Saldo inicial' }))
      const dialog = await screen.findByRole('dialog', { name: 'Saldo inicial' })
      const input = within(dialog).getByRole('textbox', { name: 'Valor (R$)' })
      expect(input).toHaveValue('1.000,00')
      await userEvent.clear(input)
      await userEvent.type(input, '3.000')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(vi.mocked(updateInitialBalance)).toHaveBeenCalledWith(300000)
      await waitFor(() => expect(summaryItem('Saldo de abertura')).toHaveTextContent('4.500,00'))
      expect(toastSuccess).toHaveBeenCalledWith('Saldo inicial salvo')
    })

    it('keeps the dialog open with the API error', async () => {
      vi.mocked(updateInitialBalance).mockRejectedValue(new ApiError(400, ['amountCents must be an integer number']))
      await openStatement()

      await userEvent.click(screen.getByRole('button', { name: 'Saldo inicial' }))
      const dialog = await screen.findByRole('dialog', { name: 'Saldo inicial' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('amountCents must be an integer number')
      expect(screen.getByRole('dialog', { name: 'Saldo inicial' })).toBeInTheDocument()
    })
  })

  describe('categories menu', () => {
    const openMenu = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Categorias' }))
      return screen.findByRole('dialog', { name: 'Categorias' })
    }

    it('lists the types and categories, inactive ones included', async () => {
      stubBudgetApi({
        groups: budgetGroups.map((g) =>
          g.id === 20 ? { ...g, categories: g.categories.map((c) => ({ ...c, active: false })) } : g,
        ),
      })
      await openStatement()

      const panel = await openMenu()
      const expenses = within(panel).getByRole('region', { name: 'Despesas' })
      expect(within(expenses).getByRole('listitem', { name: 'Despesas Básicas' })).toHaveTextContent(
        'Despesas BásicasMoradiaAlimentação',
      )
      expect(within(expenses).getByRole('listitem', { name: 'Lazer' })).toHaveTextContent('Inativa')
      expect(within(within(panel).getByRole('region', { name: 'Receitas' })).getAllByRole('listitem')).toHaveLength(4)
    })

    it('creates a category in a type', async () => {
      await openStatement()
      const panel = await openMenu()

      await userEvent.click(within(panel).getByRole('button', { name: 'Opções de Custos de Vida' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Nova categoria' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nova categoria' })
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Streaming')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))

      await waitFor(() => expect(createCategory).toHaveBeenCalledWith(20, { name: 'Streaming' }))
      // The launch form offers the new category once the tree is back
      expect(vi.mocked(fetchCategories)).toHaveBeenCalledTimes(2)
    })

    it('creates a type', async () => {
      await openStatement()
      const panel = await openMenu()

      await userEvent.click(within(panel).getByRole('button', { name: 'Novo tipo de receita' }))
      const dialog = await screen.findByRole('dialog', { name: 'Novo tipo de receita' })
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Aluguéis')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))

      await waitFor(() => expect(createGroup).toHaveBeenCalledWith({ kind: 'INCOME', name: 'Aluguéis', goalPercent: null }))
    })

    it('inactivates a category and a type', async () => {
      const success = vi.spyOn(toast, 'success')
      await openStatement()
      const panel = await openMenu()

      await userEvent.click(within(panel).getByRole('button', { name: 'Opções de Lazer' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Inativar' }))
      await waitFor(() => expect(updateCategory).toHaveBeenCalledWith(3, { active: false }))
      await waitFor(() => expect(success).toHaveBeenCalledWith('Lazer inativado(a)'))

      await userEvent.click(within(panel).getByRole('button', { name: 'Opções de Renda Extra' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Inativar' }))
      await waitFor(() => expect(updateGroup).toHaveBeenCalledWith(40, { active: false }))
    })

    it('deletes a category after confirming', async () => {
      await openStatement()
      const panel = await openMenu()

      await userEvent.click(within(panel).getByRole('button', { name: 'Opções de Alimentação' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Excluir' }))
      const confirm = await screen.findByRole('alertdialog', { name: 'Excluir a categoria Alimentação?' })
      await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }))

      await waitFor(() => expect(deleteCategory).toHaveBeenCalledWith(2))
      // Its values went too: the statement reloads
      await waitFor(() => expect(fetchTransactionsMock).toHaveBeenCalledTimes(2))
    })
  })
})
