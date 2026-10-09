import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import { createGroupTransaction, setGroupTransactionSeriesEnd } from '@/features/groups/api'
import { ApiError } from '@/lib/api/client'
import { makeAuthUser } from '@/test/auth'
import {
  equalRule,
  makeGroupTransaction,
  makeSplitMethod,
  percentRule,
  stubGroupsApi,
  waterTransaction,
} from '@/test/groups'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/groups/api')

const fixedRule = makeSplitMethod(3, {
  name: 'Fixo',
  type: 'FIXED',
  shares: [
    { memberId: 1, value: 40000 },
    { memberId: 2, value: 60000 },
  ],
})

/** An open-ended rent with no scheduled adjustment */
const openRent = makeGroupTransaction(10, {
  description: 'Aluguel',
  amountCents: 200000,
  series: {
    index: 3,
    count: 24,
    firstMonth: '2026-08',
    lastMonth: '2028-07',
    recurrence: { endMonth: null, adjustment: null },
  },
})

async function openGroup() {
  await renderRoute('/grupos/7')
  await screen.findByRole('heading', { name: 'República', level: 1 })
}

async function newExpense() {
  await userEvent.click(screen.getAllByRole('button', { name: 'Nova despesa' })[0])
  const dialog = await screen.findByRole('dialog', { name: 'Nova despesa do grupo' })
  await userEvent.type(within(dialog).getByLabelText('Descrição'), 'Aluguel')
  await userEvent.type(within(dialog).getByLabelText('Valor (R$)'), '1.000')
  return dialog
}

describe('Group recurrences (/grupos/$groupId)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue(makeAuthUser())
    stubGroupsApi({
      splitMethods: [equalRule, percentRule, fixedRule],
      transactions: [openRent, waterTransaction],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates an open-ended expense with a scheduled adjustment', async () => {
    await openGroup()
    const dialog = await newExpense()

    await userEvent.selectOptions(within(dialog).getByLabelText('Repetir'), 'Todo mês, sem data de término')
    expect(within(dialog).getByText(/Só este mês sai como pago/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Reajuste automático' }))
    await userEvent.type(within(dialog).getByLabelText('Percentual (%)'), '6')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

    await waitFor(() =>
      expect(createGroupTransaction).toHaveBeenCalledWith(7, {
        kind: 'EXPENSE',
        description: 'Aluguel',
        month: '2026-10',
        amountCents: 100000,
        splitMethodId: 1,
        openEnded: true,
        adjustment: { percentBp: 600, everyMonths: 12 },
      }),
    )
  })

  it('refuses a scheduled adjustment with a fixed rule', async () => {
    await openGroup()
    const dialog = await newExpense()

    await userEvent.selectOptions(within(dialog).getByLabelText('Regra de rateio'), 'Fixo')
    await userEvent.selectOptions(within(dialog).getByLabelText('Repetir'), 'Todo mês, sem data de término')
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Reajuste automático' }))
    await userEvent.type(within(dialog).getByLabelText('Percentual (%)'), '6')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

    expect(within(dialog).getByText('Uma regra de valores fixos não tem reajuste automático.')).toBeInTheDocument()
    expect(createGroupTransaction).not.toHaveBeenCalled()
  })

  it('ends an open-ended series from its badge, translating the API errors', async () => {
    vi.mocked(setGroupTransactionSeriesEnd).mockRejectedValueOnce(
      new ApiError(400, ['untilMonth must not be before the first occurrence']),
    )
    await openGroup()

    const badge = screen.getByRole('button', { name: 'Recorrência de Aluguel: 3, sem data de término' })
    expect(badge).toHaveTextContent('3/∞')
    await userEvent.click(badge)
    const dialog = await screen.findByRole('dialog', { name: 'Período da recorrência' })
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Sem data de término' }))
    expect(dialog).toHaveTextContent('julho de 2028')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'O último mês não pode ser antes do primeiro lançamento.',
    )
    expect(setGroupTransactionSeriesEnd).toHaveBeenCalledWith(7, 10, { untilMonth: '2028-07' })
  })
})
