import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import { STATEMENT_VIEW_KEY } from '@/features/transactions/preferences'
import { makeAuthUser } from '@/test/auth'
import { makeGroupStatement, makeStatementItem, stubBudgetApi } from '@/test/budget'
import { renderRoute } from '@/test/render'
import { octoberTransactions, stubTransactionsApi } from '@/test/transactions'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/budget/api')
vi.mock('@/features/transactions/api')

const region = (title: string) => screen.getByRole('region', { name: title })
const summaryItem = (title: string) => within(region('Resumo do mês')).getByRole('group', { name: title })
/** Row titles of a type's list, in order */
const rows = (type: string) =>
  within(screen.getByRole('list', { name: type }))
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('aria-label'))
const typeHeader = (type: string) => screen.getByRole('heading', { name: type }).parentElement!

async function openStatement() {
  const result = await renderRoute('/extrato')
  await screen.findByRole('heading', { name: 'Extrato' })
  return result
}

async function openSortDialog() {
  await userEvent.click(screen.getByRole('button', { name: /^Ordenar:/ }))
  return within(await screen.findByRole('dialog', { name: 'Ordenar lançamentos' }))
}

describe('Statement route (/extrato): filter and ordering', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue(makeAuthUser())
    // Despesas Básicas: rent (pending, day 10), food (realized 750,00, no day),
    // the paid rent share (1000,00) and a pending water share (50,00, day 5)
    const republica = makeGroupStatement()
    stubBudgetApi({
      groupStatements: [
        {
          ...republica,
          items: [...republica.items, makeStatementItem(11, { description: 'Água', shareCents: 5000, dueDay: 5 })],
        },
      ],
    })
    stubTransactionsApi(octoberTransactions)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('orders by due day by default, group shares among the transactions', async () => {
    await openStatement()

    expect(screen.getByRole('button', { name: 'Ordenar: Vencimento ↑' })).toBeInTheDocument()
    expect(rows('Despesas Básicas')).toEqual(['Água (República)', 'Aluguel', 'Alimentação', 'Aluguel (República)'])
  })

  it('shows only what is pending, keeping the month’s summary', async () => {
    await openStatement()

    await userEvent.click(screen.getByRole('switch', { name: 'Somente pendentes' }))

    expect(rows('Despesas Básicas')).toEqual(['Água (República)', 'Aluguel'])
    // The type's subtotal covers the shown rows: 1800,00 + 50,00
    expect(typeHeader('Despesas Básicas')).toHaveTextContent('R$ 1.850,00')
    // The salary is pending too
    expect(rows('Salário')).toEqual(['Salário'])
    // Summary: rent + food + both shares
    expect(summaryItem('Despesas do mês')).toHaveTextContent('R$ 3.600,00')

    await userEvent.click(screen.getByRole('switch', { name: 'Somente pendentes' }))
    expect(rows('Despesas Básicas')).toHaveLength(4)
  })

  it('says when a section has nothing pending', async () => {
    stubTransactionsApi([{ ...octoberTransactions[0], realizedCents: 500000 }])
    await openStatement()

    await userEvent.click(screen.getByRole('switch', { name: 'Somente pendentes' }))

    expect(within(region('Receitas')).getByText('Nenhuma receita pendente neste mês.')).toBeInTheDocument()
    expect(within(region('Receitas')).queryByRole('list')).not.toBeInTheDocument()
  })

  it('orders by the chosen criteria, ties falling to the next one', async () => {
    await openStatement()

    let dialog = await openSortDialog()
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Critério 1º' }), 'Valor')
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Direção 1º' }), 'Maior primeiro')
    await userEvent.click(dialog.getByRole('button', { name: 'Aplicar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ordenar: Valor ↓' })).toBeInTheDocument()
    expect(rows('Despesas Básicas')).toEqual(['Aluguel', 'Aluguel (República)', 'Alimentação', 'Água (República)'])

    // Status first, then the amount
    dialog = await openSortDialog()
    await userEvent.click(dialog.getByRole('button', { name: 'Adicionar critério' }))
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Critério 2º' }), 'Situação')
    await userEvent.click(dialog.getByRole('button', { name: 'Subir Situação' }))
    expect(dialog.getByRole('combobox', { name: 'Critério 1º' })).toHaveDisplayValue('Situação')
    expect(dialog.getByRole('combobox', { name: 'Direção 1º' })).toHaveDisplayValue('Pendentes primeiro')
    await userEvent.click(dialog.getByRole('button', { name: 'Aplicar' }))

    expect(screen.getByRole('button', { name: 'Ordenar: Situação ↑, Valor ↓' })).toBeInTheDocument()
    expect(rows('Despesas Básicas')).toEqual(['Aluguel', 'Água (República)', 'Aluguel (República)', 'Alimentação'])
  })

  it('offers each criterion once and keeps at least one', async () => {
    await openStatement()

    const dialog = await openSortDialog()
    expect(dialog.getByRole('button', { name: 'Remover Vencimento' })).toBeDisabled()
    for (let i = 0; i < 4; i++) await userEvent.click(dialog.getByRole('button', { name: 'Adicionar critério' }))

    expect(dialog.getAllByRole('listitem')).toHaveLength(5)
    expect(dialog.queryByRole('button', { name: 'Adicionar critério' })).not.toBeInTheDocument()
    const options = within(dialog.getByRole('combobox', { name: 'Critério 2º' })).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Forma de pagamento'])

    await userEvent.click(dialog.getByRole('button', { name: 'Remover Vencimento' }))
    expect(dialog.getAllByRole('listitem')).toHaveLength(4)
    expect(dialog.getByRole('combobox', { name: 'Critério 1º' })).toHaveDisplayValue('Forma de pagamento')
  })

  it('discards the changes on cancel and restores the default', async () => {
    await openStatement()

    let dialog = await openSortDialog()
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Critério 1º' }), 'Valor')
    await userEvent.click(dialog.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('button', { name: 'Ordenar: Vencimento ↑' })).toBeInTheDocument()

    dialog = await openSortDialog()
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Critério 1º' }), 'Categoria')
    await userEvent.click(dialog.getByRole('button', { name: 'Aplicar' }))
    expect(screen.getByRole('button', { name: 'Ordenar: Categoria ↑' })).toBeInTheDocument()

    dialog = await openSortDialog()
    await userEvent.click(dialog.getByRole('button', { name: 'Restaurar padrão' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Aplicar' }))
    expect(screen.getByRole('button', { name: 'Ordenar: Vencimento ↑' })).toBeInTheDocument()
  })

  it('remembers the filter and the ordering in this browser', async () => {
    const { unmount } = await openStatement()

    await userEvent.click(screen.getByRole('switch', { name: 'Somente pendentes' }))
    const dialog = await openSortDialog()
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Critério 1º' }), 'Valor')
    await userEvent.click(dialog.getByRole('button', { name: 'Aplicar' }))
    expect(JSON.parse(localStorage.getItem(STATEMENT_VIEW_KEY)!)).toEqual({
      pendingOnly: true,
      sort: [{ key: 'amount', direction: 'asc' }],
    })
    unmount()

    await openStatement()
    expect(screen.getByRole('switch', { name: 'Somente pendentes' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Ordenar: Valor ↑' })).toBeInTheDocument()
    expect(rows('Despesas Básicas')).toEqual(['Água (República)', 'Aluguel'])
  })

  it('ignores an invalid stored preference', async () => {
    localStorage.setItem(STATEMENT_VIEW_KEY, '{"pendingOnly":"yes","sort":[{"key":"name"}]')
    await openStatement()

    expect(screen.getByRole('switch', { name: 'Somente pendentes' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Ordenar: Vencimento ↑' })).toBeInTheDocument()
  })
})
