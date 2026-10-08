import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import { fetchCategories } from '@/features/budget/api'
import { fetchGroup, setGroupLink } from '@/features/groups/api'
import { budgetGroups, makeCategory, makeGroup as makeCategoryGroup, stubBudgetApi } from '@/test/budget'
import { makeGroup, makeGroupCategory, stubGroupsApi } from '@/test/groups'
import { makeAuthUser } from '@/test/auth'
import { ApiError } from '@/lib/api/client'
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
    expect(setGroupLink).toHaveBeenCalledWith(7, { expenseCategoryId: 1, incomeCategoryId: null, paymentMethodId: null, categoryLinks: [] })
    expect(fetchGroup).toHaveBeenCalledTimes(2)
  })

  it('keeps a linked category that was inactivated as an option', async () => {
    stubGroupsApi({ group: makeGroup({ link: { expenseCategoryId: 6, incomeCategoryId: null, paymentMethodId: null, categoryLinks: [] } }) })
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

  describe('category by category', () => {
    const groupCategories = [
      makeGroupCategory(20, 'Aluguel'),
      makeGroupCategory(21, 'Mercado'),
      makeGroupCategory(22, 'Antiga', { active: false }),
      makeGroupCategory(23, 'Sublocação', { kind: 'INCOME' }),
    ]

    it('keeps one category per kind without group categories', async () => {
      const dialog = await openLinkDialog()

      expect(within(dialog).queryByRole('switch', { name: 'Categoria por categoria' })).not.toBeInTheDocument()
    })

    it('maps each group category, the others using the default', async () => {
      stubGroupsApi({ group: makeGroup({ categories: groupCategories }) })
      const dialog = await openLinkDialog()

      expect(within(dialog).queryByRole('combobox', { name: 'Aluguel' })).not.toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('switch', { name: 'Categoria por categoria' }))

      const expenses = within(dialog).getByRole('group', { name: 'Despesas do grupo' })
      // Inactive group categories aren't offered unless already mapped
      expect(within(expenses).queryByRole('combobox', { name: /Antiga/ })).not.toBeInTheDocument()
      const mercado = within(expenses).getByRole('combobox', { name: 'Mercado' })
      await waitFor(() => expect(within(mercado).getByRole('option', { name: 'Alimentação' })).toBeInTheDocument())
      expect(within(mercado).getAllByRole('option')[0]).toHaveTextContent('Usar a padrão')
      await userEvent.selectOptions(mercado, 'Alimentação')
      await userEvent.selectOptions(
        within(expenses).getByRole('combobox', { name: 'Demais despesas e sem categoria' }),
        'Moradia',
      )
      const incomes = within(dialog).getByRole('group', { name: 'Receitas do grupo' })
      await userEvent.selectOptions(within(incomes).getByRole('combobox', { name: 'Sublocação' }), 'Renda extra')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(setGroupLink).toHaveBeenCalledWith(7, {
        expenseCategoryId: 1,
        incomeCategoryId: null,
        paymentMethodId: null,
        categoryLinks: [
          { groupCategoryId: 21, categoryId: 2 },
          { groupCategoryId: 23, categoryId: 5 },
        ],
      })
    })

    it('starts in that mode with the saved links and switching back clears them', async () => {
      stubGroupsApi({
        group: makeGroup({
          categories: groupCategories,
          link: {
            expenseCategoryId: 1,
            incomeCategoryId: null,
            paymentMethodId: null,
            categoryLinks: [{ groupCategoryId: 22, categoryId: 2 }],
          },
        }),
      })
      const dialog = await openLinkDialog()

      const toggle = within(dialog).getByRole('switch', { name: 'Categoria por categoria' })
      expect(toggle).toBeChecked()
      // The inactive one stays while mapped
      const antiga = within(dialog).getByRole('combobox', { name: 'Antiga (inativa)' })
      await waitFor(() => expect(antiga).toHaveValue('2'))

      await userEvent.click(toggle)
      expect(within(dialog).getByRole('combobox', { name: 'Despesas do grupo' })).toHaveValue('1')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      await waitFor(() =>
        expect(setGroupLink).toHaveBeenCalledWith(7, {
          expenseCategoryId: 1,
          incomeCategoryId: null,
          paymentMethodId: null,
          categoryLinks: [],
        }),
      )
    })

    it('shows the API error and keeps the dialog open', async () => {
      stubGroupsApi({ group: makeGroup({ categories: groupCategories }) })
      vi.mocked(setGroupLink).mockRejectedValue(
        new ApiError(400, ['categoryLinks.categoryId must be an expense category']),
      )
      const dialog = await openLinkDialog()
      await userEvent.click(within(dialog).getByRole('switch', { name: 'Categoria por categoria' }))
      const mercado = within(dialog).getByRole('combobox', { name: 'Mercado' })
      await waitFor(() => expect(within(mercado).getByRole('option', { name: 'Alimentação' })).toBeInTheDocument())
      await userEvent.selectOptions(mercado, 'Alimentação')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Cada categoria de despesa do grupo deve apontar para uma categoria de despesa sua.',
      )
    })
  })
})
