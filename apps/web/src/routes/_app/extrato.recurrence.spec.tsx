import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import {
  createTransaction,
  deleteTransaction,
  setTransactionSeriesEnd,
  updateTransaction,
} from '@/features/transactions/api'
import { ApiError } from '@/lib/api/client'
import { makeAuthUser } from '@/test/auth'
import { stubBudgetApi } from '@/test/budget'
import { renderRoute } from '@/test/render'
import {
  foodTransaction,
  openRentTransaction,
  salaryTransaction,
  stubTransactionsApi,
} from '@/test/transactions'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/budget/api')
vi.mock('@/features/transactions/api')

const createMock = vi.mocked(createTransaction)
const seriesMock = vi.mocked(setTransactionSeriesEnd)

async function openStatement() {
  await renderRoute('/extrato')
  await screen.findByRole('heading', { name: 'Extrato' })
}

async function newExpense() {
  await userEvent.click(screen.getByRole('button', { name: 'Nova despesa' }))
  const dialog = await screen.findByRole('dialog', { name: 'Nova despesa' })
  await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Categoria' }), 'Moradia')
  await userEvent.type(within(dialog).getByLabelText('Descrição (opcional)'), 'Aluguel')
  await userEvent.type(within(dialog).getByLabelText('Valor previsto (R$)'), '1.800')
  return dialog
}

async function rowAction(title: string, action: string) {
  await userEvent.click(screen.getByRole('button', { name: `Opções de ${title}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: action }))
}

describe('Statement recurrences (/extrato)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue(makeAuthUser())
    stubBudgetApi()
    stubTransactionsApi([salaryTransaction, openRentTransaction, foodTransaction])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('launching', () => {
    it('launches an expense repeated every month with no end', async () => {
      await openStatement()
      const dialog = await newExpense()

      await userEvent.selectOptions(within(dialog).getByLabelText('Repetir'), 'Todo mês, sem data de término')
      expect(within(dialog).getByText(/Os próximos meses são criados automaticamente/)).toBeInTheDocument()
      expect(within(dialog).queryByLabelText('Quantidade de meses')).not.toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      await waitFor(() =>
        expect(createMock).toHaveBeenCalledWith({
          categoryId: 1,
          description: 'Aluguel',
          plannedCents: 180000,
          month: '2026-10',
          openEnded: true,
        }),
      )
    })

    it('adds a scheduled adjustment, defaulting its first month', async () => {
      await openStatement()
      const dialog = await newExpense()

      await userEvent.selectOptions(within(dialog).getByLabelText('Repetir'), 'Todo mês, sem data de término')
      await userEvent.click(within(dialog).getByRole('switch', { name: 'Reajuste automático' }))
      expect(within(dialog).getByText(/Em branco, o primeiro reajuste é em out\/27/)).toBeInTheDocument()
      await userEvent.type(within(dialog).getByLabelText('Percentual (%)'), '4,5')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      await waitFor(() =>
        expect(createMock).toHaveBeenCalledWith(
          expect.objectContaining({ openEnded: true, adjustment: { percentBp: 450, everyMonths: 12 } }),
        ),
      )
    })

    it('adjusts a series of some months from a chosen month', async () => {
      await openStatement()
      const dialog = await newExpense()

      await userEvent.selectOptions(within(dialog).getByLabelText('Repetir'), 'Por alguns meses')
      await userEvent.click(within(dialog).getByRole('switch', { name: 'Reajuste automático' }))
      await userEvent.type(within(dialog).getByLabelText('Percentual (%)'), '10')
      const every = within(dialog).getByLabelText('A cada (meses)')
      await userEvent.clear(every)
      await userEvent.type(every, '6')
      await userEvent.type(within(dialog).getByLabelText('Primeiro reajuste (opcional)'), '2027-01')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      await waitFor(() =>
        expect(createMock).toHaveBeenCalledWith(
          expect.objectContaining({
            repeatMonths: 12,
            adjustment: { percentBp: 1000, everyMonths: 6, firstMonth: '2027-01' },
          }),
        ),
      )
      expect(createMock.mock.calls[0][0]).not.toHaveProperty('openEnded')
    })

    it('validates the adjustment before calling the API, and translates its errors', async () => {
      createMock.mockRejectedValueOnce(new ApiError(400, ['An adjustment needs a recurring launch']))
      await openStatement()
      const dialog = await newExpense()

      await userEvent.selectOptions(within(dialog).getByLabelText('Repetir'), 'Todo mês, sem data de término')
      await userEvent.click(within(dialog).getByRole('switch', { name: 'Reajuste automático' }))
      const every = within(dialog).getByLabelText('A cada (meses)')
      await userEvent.clear(every)
      await userEvent.type(every, '0')
      await userEvent.type(within(dialog).getByLabelText('Primeiro reajuste (opcional)'), '2026-09')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      expect(within(dialog).getByText('Informe um percentual entre 0,01 e 100.')).toBeInTheDocument()
      expect(within(dialog).getByText('Informe de 1 a 60 meses.')).toBeInTheDocument()
      expect(within(dialog).getByText('Escolha um mês depois de out/26.')).toBeInTheDocument()
      expect(createMock).not.toHaveBeenCalled()

      await userEvent.type(within(dialog).getByLabelText('Percentual (%)'), '5')
      await userEvent.type(every, '2')
      await userEvent.clear(within(dialog).getByLabelText('Primeiro reajuste (opcional)'))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      expect(
        await within(dialog).findByText('O reajuste automático só vale para lançamentos que se repetem.'),
      ).toBeInTheDocument()
    })
  })

  describe('an open-ended series', () => {
    it('shows ∞ and the adjustment on its badge', async () => {
      await openStatement()

      expect(
        screen.getByRole('button', {
          name: 'Recorrência de Aluguel: 1, sem data de término. Reajuste +5% a cada 12 meses, desde mar/27',
        }),
      ).toHaveTextContent('1/∞')
    })

    it('sets an end month from the badge', async () => {
      await openStatement()
      await userEvent.click(screen.getByRole('button', { name: /^Recorrência de Aluguel/ }))
      const dialog = await screen.findByRole('dialog', { name: 'Período da recorrência' })
      expect(dialog).toHaveTextContent('Aluguel: lançamento 1, desde out/26, sem data de término.')
      expect(within(dialog).getByRole('switch', { name: 'Sem data de término' })).toBeChecked()
      expect(within(dialog).getByRole('switch', { name: 'Reajuste automático' })).toBeChecked()
      expect(within(dialog).getByLabelText('Percentual (%)')).toHaveValue('5')
      expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeDisabled()

      await userEvent.click(within(dialog).getByRole('switch', { name: 'Sem data de término' }))
      const earlier = within(dialog).getByRole('button', { name: 'Mês anterior' })
      for (let i = 0; i < 12; i++) await userEvent.click(earlier)
      expect(dialog).toHaveTextContent('setembro de 2027')
      // No cap: months are created as they are read
      expect(within(dialog).getByRole('button', { name: 'Próximo mês' })).toBeEnabled()
      expect(within(dialog).getByRole('status')).toHaveTextContent(
        'Os lançamentos pendentes depois de setembro de 2027 serão excluídos',
      )
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      await waitFor(() => expect(seriesMock).toHaveBeenCalledWith(2, { untilMonth: '2027-09' }))
    })

    it('removes the scheduled adjustment', async () => {
      await openStatement()
      await userEvent.click(screen.getByRole('button', { name: /^Recorrência de Aluguel/ }))
      const dialog = await screen.findByRole('dialog', { name: 'Período da recorrência' })

      await userEvent.click(within(dialog).getByRole('switch', { name: 'Reajuste automático' }))
      expect(within(dialog).getByRole('status')).toHaveTextContent(
        'Os lançamentos pendentes depois de outubro de 2026 serão recalculados sem reajuste',
      )
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      await waitFor(() => expect(seriesMock).toHaveBeenCalledWith(2, { untilMonth: null, adjustment: null }))
    })

    it('warns that deleting the next ones ends the recurrence', async () => {
      await openStatement()

      await rowAction('Aluguel', 'Excluir')
      const ask = await screen.findByRole('alertdialog', { name: 'Excluir lançamento recorrente' })
      expect(ask).toHaveTextContent('Excluir também os próximos encerra a recorrência')
      await userEvent.click(within(ask).getByRole('button', { name: 'Excluir também os próximos' }))

      await waitFor(() => expect(vi.mocked(deleteTransaction)).toHaveBeenCalledWith(2, 'FOLLOWING'))
    })

    it('warns that a new amount becomes the base of the adjustment', async () => {
      await openStatement()

      await rowAction('Aluguel', 'Editar')
      const form = await screen.findByRole('dialog', { name: 'Editar lançamento' })
      const amount = within(form).getByLabelText('Valor previsto (R$)')
      await userEvent.clear(amount)
      await userEvent.type(amount, '2.000')
      await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }))

      const ask = await screen.findByRole('alertdialog', { name: 'Alterar lançamento recorrente' })
      expect(ask).toHaveTextContent(
        'o reajuste programado (+5% a cada 12 meses, desde mar/27) passa a ser aplicado sobre o novo valor',
      )
      await userEvent.click(within(ask).getByRole('button', { name: 'Alterar também os próximos' }))
      await waitFor(() =>
        expect(vi.mocked(updateTransaction)).toHaveBeenCalledWith(
          2,
          expect.objectContaining({ plannedCents: 200000 }),
          'FOLLOWING',
        ),
      )
    })
  })

  describe('a finite series', () => {
    it('becomes open-ended from its badge', async () => {
      stubTransactionsApi()
      await openStatement()
      await userEvent.click(screen.getByRole('button', { name: 'Recorrência de Aluguel: 1 de 12' }))
      const dialog = await screen.findByRole('dialog', { name: 'Período da recorrência' })

      await userEvent.click(within(dialog).getByRole('switch', { name: 'Sem data de término' }))
      expect(within(dialog).queryByRole('button', { name: 'Próximo mês' })).not.toBeInTheDocument()
      expect(within(dialog).getByRole('status')).toHaveTextContent(
        'Os próximos meses passam a ser criados automaticamente',
      )
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      await waitFor(() => expect(seriesMock).toHaveBeenCalledWith(2, { untilMonth: null }))
    })
  })
})
