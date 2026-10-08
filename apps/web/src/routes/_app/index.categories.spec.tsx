import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import {
  createCategory,
  createGroup,
  deleteCategory,
  deleteGroup,
  fetchCategories,
  fetchEntries,
  saveLines,
  updateCategory,
  updateGroup,
} from '@/features/budget/api'
import type { CategoryGroup } from '@/features/budget/types'
import { ApiError } from '@/lib/api/client'
import { budgetGroups, makeCategory, makeGroup, stubBudgetApi } from '@/test/budget'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/budget/api')

const fetchCategoriesMock = vi.mocked(fetchCategories)
const fetchEntriesMock = vi.mocked(fetchEntries)

/** The tree with one category or type changed */
const withCategory = (id: number, patch: object): CategoryGroup[] =>
  budgetGroups.map((g) => ({
    ...g,
    categories: g.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  }))
const withGroup = (id: number, patch: object): CategoryGroup[] =>
  budgetGroups.map((g) => (g.id === id ? { ...g, ...patch } : g))

const rowCells = (header: string) =>
  within(screen.getByRole('rowheader', { name: header }).closest('tr')!)
    .getAllByRole('cell')
    .map((cell) => cell.textContent?.replace(/\s/g, ' '))
const unsavedBar = () => screen.queryByRole('region', { name: 'Alterações não salvas' })

/** Opens the dashboard with the given categories expanded to their launches */
async function openDashboard(...expand: string[]) {
  await renderRoute('/')
  await screen.findByRole('heading', { name: 'Dashboard' })
  for (const category of expand) await userEvent.click(screen.getByRole('button', { name: category }))
}

/** Opens a row's menu through its hover "⋯" button and picks an option */
async function rowAction(row: string, option: string) {
  await userEvent.click(screen.getByRole('button', { name: `Opções de ${row}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: option }))
}

async function typeInCell(name: string, text: string) {
  const input = screen.getByRole('textbox', { name })
  await userEvent.click(input)
  await userEvent.clear(input)
  await userEvent.type(input, text)
  await userEvent.tab()
}

describe('Dashboard: managing types and categories', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue({ id: 1, name: 'Ana Souza', email: 'ana@example.com' })
    stubBudgetApi()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps Despesas and Receitas fixed: they have no menu', async () => {
    await openDashboard()

    expect(screen.queryByRole('button', { name: 'Opções de Despesas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Opções de Receitas' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Opções de Despesas Básicas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Opções de Moradia' })).toBeInTheDocument()
  })

  it('offers the type actions on right click', async () => {
    await openDashboard()

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByRole('button', { name: 'Custos de Vida' }) })

    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Editar',
      'Nova categoria',
      'Inativar',
      'Excluir',
    ])
  })

  it('offers the category actions, launching included', async () => {
    await openDashboard()

    await userEvent.click(screen.getByRole('button', { name: 'Opções de Moradia' }))

    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Novo lançamento',
      'Editar',
      'Inativar',
      'Excluir',
    ])
  })

  it('renames a category; description and due day belong to its launches', async () => {
    await openDashboard()

    await rowAction('Moradia', 'Editar')
    const dialog = await screen.findByRole('dialog', { name: 'Editar categoria' })
    expect(within(dialog).queryByRole('textbox', { name: /Descrição/ })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('textbox', { name: /Dia de vencimento/ })).not.toBeInTheDocument()
    const name = within(dialog).getByRole('textbox', { name: 'Nome' })
    expect(name).toHaveValue('Moradia')
    await userEvent.clear(name)
    await userEvent.type(name, 'Casa')

    fetchCategoriesMock.mockResolvedValue(withCategory(1, { name: 'Casa' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(updateCategory).toHaveBeenCalledWith(1, { name: 'Casa' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('rowheader', { name: 'Casa' })).toBeInTheDocument()
  })

  it('renames a type and sets its goal from the edit dialog', async () => {
    await openDashboard()

    await rowAction('Despesas Básicas', 'Editar')
    const dialog = await screen.findByRole('dialog', { name: 'Editar tipo' })
    const name = within(dialog).getByRole('textbox', { name: 'Nome' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Essenciais')
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Meta/ }), '50')

    fetchCategoriesMock.mockResolvedValue(withGroup(10, { name: 'Essenciais', goalPercent: 50 }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(updateGroup).toHaveBeenCalledWith(10, { name: 'Essenciais', goalPercent: 50 })
    expect(await screen.findByRole('rowheader', { name: 'Essenciais' })).toHaveTextContent('Meta 50%')
  })

  it('does not offer a goal for income types', async () => {
    await openDashboard()

    await rowAction('Renda Extra', 'Editar')

    const dialog = await screen.findByRole('dialog', { name: 'Editar tipo' })
    expect(within(dialog).queryByRole('textbox', { name: /Meta/ })).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(updateGroup).toHaveBeenCalledWith(40, { name: 'Renda Extra' })
  })

  describe('"+ Nova categoria"', () => {
    it('creates a category at the end of the type, ready for launches', async () => {
      await openDashboard()

      await userEvent.click(screen.getByRole('button', { name: 'Nova categoria em Despesas Básicas' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nova categoria' })
      expect(dialog).toHaveTextContent('Em Despesas Básicas.')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Condomínio')
      fetchCategoriesMock.mockResolvedValue(
        budgetGroups.map((g) =>
          g.id === 10 ? { ...g, categories: [...g.categories, makeCategory(9, 'Condomínio', 2)] } : g,
        ),
      )
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))

      expect(createCategory).toHaveBeenCalledWith(10, { name: 'Condomínio' })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      const names = screen.getAllByRole('rowheader').map((h) => h.getAttribute('aria-label') ?? h.textContent)
      expect(names.slice(1, 5)).toEqual(['Despesas Básicas', 'Moradia', 'Alimentação', 'Condomínio'])
      expect(rowCells('Condomínio')[0]).toBe('R$ 0,00')
      await userEvent.click(screen.getByRole('button', { name: 'Condomínio' }))
      expect(screen.getByRole('button', { name: 'Novo lançamento em Condomínio' })).toBeInTheDocument()
    })

    it('requires a name and shows a duplicate name error from the API', async () => {
      vi.mocked(createCategory).mockRejectedValue(new ApiError(409, ['An item with this name already exists']))
      await openDashboard()

      await userEvent.click(screen.getByRole('button', { name: 'Nova categoria em Custos de Vida' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nova categoria' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))
      expect(within(dialog).getByText('Informe o nome.')).toBeInTheDocument()

      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Lazer')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Já existe um item com esse nome.')
      expect(createCategory).toHaveBeenCalledWith(20, { name: 'Lazer' })
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  describe('inactivating', () => {
    it('hides an inactive category, keeps its values in the totals and shows it on demand', async () => {
      await openDashboard('Lazer')
      expect(rowCells('Despesas')[2]).toBe('R$ 300,00')

      fetchCategoriesMock.mockResolvedValue(withCategory(3, { active: false }))
      await rowAction('Lazer', 'Inativar')

      expect(updateCategory).toHaveBeenCalledWith(3, { active: false })
      await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'Lazer' })).not.toBeInTheDocument())
      // History kept: December still counts Lazer's 300,00
      expect(rowCells('Despesas')[2]).toBe('R$ 300,00')

      await userEvent.click(screen.getByRole('switch', { name: 'Mostrar inativas' }))
      const row = screen.getByRole('rowheader', { name: 'Lazer' })
      expect(row).toHaveTextContent('Inativa')
      expect(row.closest('tr')).toHaveAttribute('data-inactive', 'true')
      // Read-only: its launches are shown as text, not inputs, and take no new ones
      expect(screen.queryByRole('textbox', { name: 'Sem descrição em dezembro de 2026' })).not.toBeInTheDocument()
      expect(rowCells('Sem descrição')[2]).toBe('R$ 300,00')
      expect(rowCells('Lazer')[2]).toBe('R$ 300,00')
      expect(screen.queryByRole('button', { name: 'Novo lançamento em Lazer' })).not.toBeInTheDocument()

      fetchCategoriesMock.mockResolvedValue(budgetGroups)
      await rowAction('Lazer', 'Reativar')
      expect(updateCategory).toHaveBeenLastCalledWith(3, { active: true })
      expect(await screen.findByRole('textbox', { name: 'Sem descrição em dezembro de 2026' })).toHaveValue('300,00')
    })

    it('drops the unsaved edits of a category when it is inactivated', async () => {
      await openDashboard('Lazer', 'Moradia')
      await typeInCell('Sem descrição em outubro de 2026', '50')
      await typeInCell('Aluguel em outubro de 2026', '10')
      expect(unsavedBar()).toHaveTextContent('2 alterações não salvas')

      fetchCategoriesMock.mockResolvedValue(withCategory(3, { active: false }))
      await rowAction('Lazer', 'Inativar')

      await waitFor(() => expect(unsavedBar()).toHaveTextContent('1 alteração não salva'))
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
      expect(saveLines).toHaveBeenCalledWith([{ anchorId: 101, month: '2026-10', amountCents: 1000 }])
    })

    it('inactivates a whole type, which also stops its categories', async () => {
      await openDashboard('Lazer')

      fetchCategoriesMock.mockResolvedValue(withGroup(20, { active: false }))
      await rowAction('Custos de Vida', 'Inativar')

      expect(updateGroup).toHaveBeenCalledWith(20, { active: false })
      await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'Custos de Vida' })).not.toBeInTheDocument())

      await userEvent.click(screen.getByRole('switch', { name: 'Mostrar inativas' }))
      expect(screen.getByRole('rowheader', { name: 'Custos de Vida' })).toHaveTextContent('Inativo')
      // Its (active) category is read-only and can't get new siblings or launches
      expect(screen.queryByRole('textbox', { name: 'Sem descrição em outubro de 2026' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Novo lançamento em Lazer' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Nova categoria em Custos de Vida' })).not.toBeInTheDocument()
    })
  })

  describe('deleting', () => {
    it('asks before deleting a category and its values', async () => {
      await openDashboard()

      await rowAction('Moradia', 'Excluir')
      let dialog = await screen.findByRole('alertdialog', { name: 'Excluir a categoria Moradia?' })
      expect(dialog).toHaveTextContent('valores lançados nesta categoria serão apagados')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      expect(deleteCategory).not.toHaveBeenCalled()

      await rowAction('Moradia', 'Excluir')
      dialog = await screen.findByRole('alertdialog')
      fetchCategoriesMock.mockResolvedValue(
        budgetGroups.map((g) => ({ ...g, categories: g.categories.filter((c) => c.id !== 1) })),
      )
      fetchEntriesMock.mockClear()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }))

      expect(deleteCategory).toHaveBeenCalledWith(1)
      await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'Moradia' })).not.toBeInTheDocument())
      // Values and balances are reloaded
      expect(fetchEntriesMock).toHaveBeenCalled()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('keeps the dialog open with the error when deleting fails', async () => {
      vi.mocked(deleteGroup).mockRejectedValue(new ApiError(404, ['Type not found']))
      await openDashboard()

      await rowAction('Renda Extra', 'Excluir')
      const dialog = await screen.findByRole('alertdialog', { name: 'Excluir o tipo Renda Extra?' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Type not found')
      expect(deleteGroup).toHaveBeenCalledWith(40)
    })

    it('deletes a type and forgets the unsaved edits of its categories', async () => {
      await openDashboard('Lazer')
      await typeInCell('Sem descrição em outubro de 2026', '50')

      await rowAction('Custos de Vida', 'Excluir')
      fetchCategoriesMock.mockResolvedValue(budgetGroups.filter((g) => g.id !== 20))
      await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }))

      expect(deleteGroup).toHaveBeenCalledWith(20)
      await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'Custos de Vida' })).not.toBeInTheDocument())
      expect(unsavedBar()).not.toBeInTheDocument()
    })
  })

  describe('new types from the table header', () => {
    it('creates an expense type with a goal', async () => {
      await openDashboard()

      await userEvent.click(screen.getByRole('button', { name: 'Novo tipo' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Tipo de despesa' }))
      const dialog = await screen.findByRole('dialog', { name: 'Novo tipo de despesa' })
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Investimentos')
      const goal = within(dialog).getByRole('textbox', { name: /Meta/ })
      await userEvent.type(goal, '120')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))
      expect(within(dialog).getByText('Informe um percentual inteiro entre 1 e 100.')).toBeInTheDocument()

      await userEvent.clear(goal)
      await userEvent.type(goal, '10')
      fetchCategoriesMock.mockResolvedValue([
        ...budgetGroups,
        makeGroup({ id: 50, kind: 'EXPENSE', name: 'Investimentos', position: 2, goalPercent: 10, categories: [] }),
      ])
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))

      expect(createGroup).toHaveBeenCalledWith({ kind: 'EXPENSE', name: 'Investimentos', goalPercent: 10 })
      expect(await screen.findByRole('rowheader', { name: 'Investimentos' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Nova categoria em Investimentos' })).toBeInTheDocument()
    })

    it('creates an income type without a goal', async () => {
      await openDashboard()

      await userEvent.click(screen.getByRole('button', { name: 'Novo tipo' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Tipo de receita' }))
      const dialog = await screen.findByRole('dialog', { name: 'Novo tipo de receita' })
      expect(within(dialog).queryByRole('textbox', { name: /Meta/ })).not.toBeInTheDocument()
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Aluguéis')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))

      expect(createGroup).toHaveBeenCalledWith({ kind: 'INCOME', name: 'Aluguéis', goalPercent: null })
    })
  })
})
