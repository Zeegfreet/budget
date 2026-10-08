import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import { fetchCategories } from '@/features/budget/api'
import { fetchGroup, setGroupLink } from '@/features/groups/api'
import { budgetGroups, makeCategory, makeGroup as makeCategoryGroup, stubBudgetApi } from '@/test/budget'
import { makeGroup, stubGroupsApi } from '@/test/groups'
import { makeAuthUser } from '@/test/auth'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/budget/api')
vi.mock('@/features/groups/api')

async function openLinkDialog() {
  await renderRoute('/grupos/7')
  await screen.findByRole('heading', { name: 'República', level: 1 })
  await userEvent.click(screen.getByRole('button', { name: 'Opções do grupo' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Vincular ao orçamento' }))
  return screen.findByRole('dialog', { name: 'Vincular ao orçamento' })
}

describe('Group route (/grupos/$groupId): link to the budget', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue(makeAuthUser())
    stubBudgetApi()
    stubGroupsApi()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads the categories only when the dialog opens', async () => {
    await renderRoute('/grupos/7')
    await screen.findByRole('heading', { name: 'República', level: 1 })

    expect(fetchCategories).not.toHaveBeenCalled()
  })

  it('offers the active categories of each kind and saves the link', async () => {
    const dialog = await openLinkDialog()

    const expenses = within(dialog).getByRole('combobox', { name: 'Despesas do grupo' })
    await waitFor(() => expect(within(expenses).getByRole('option', { name: 'Moradia' })).toBeInTheDocument())
    expect(expenses).toHaveValue('')
    expect(within(expenses).queryByRole('option', { name: 'Salário' })).not.toBeInTheDocument()
    const incomes = within(dialog).getByRole('combobox', { name: 'Receitas do grupo' })
    expect(within(incomes).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Não vincular',
      'Salário',
      'Renda extra',
    ])

    await userEvent.selectOptions(expenses, 'Moradia')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(setGroupLink).toHaveBeenCalledWith(7, { expenseCategoryId: 1, incomeCategoryId: null, paymentMethodId: null })
    expect(fetchGroup).toHaveBeenCalledTimes(2)
  })

  it('keeps a linked category that was inactivated as an option', async () => {
    stubGroupsApi({ group: makeGroup({ link: { expenseCategoryId: 6, incomeCategoryId: null, paymentMethodId: null } }) })
    stubBudgetApi({
      groups: [
        ...budgetGroups,
        makeCategoryGroup({
          id: 50,
          kind: 'EXPENSE',
          name: 'Antigos',
          position: 4,
          categories: [makeCategory(6, 'Casa velha', 0, { active: false })],
        }),
      ],
    })
    const dialog = await openLinkDialog()

    const expenses = within(dialog).getByRole('combobox', { name: 'Despesas do grupo' })
    await waitFor(() => expect(expenses).toHaveValue('6'))
    expect(within(expenses).getByRole('option', { name: 'Casa velha (inativa)' })).toBeInTheDocument()
  })
})
