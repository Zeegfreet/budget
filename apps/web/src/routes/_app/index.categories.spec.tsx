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
  savePlan,
  updateCategory,
  updateGroup,
} from '@/features/budget/api'
import { UNSAVED_CHANGES_MESSAGE } from '@/features/budget/hooks'
import { ApiError } from '@/lib/api/client'
import { budgetGroups, makeCategory, stubBudgetApi } from '@/test/budget'
import { makeAuthUser } from '@/test/auth'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/budget/api')
// Launching from the grid lists the payment methods
vi.mock('@/features/payment-methods/api')

const savePlanMock = vi.mocked(savePlan)

const rowCells = (header: string) =>
  within(screen.getByRole('rowheader', { name: header }).closest('tr')!)
    .getAllByRole('cell')
    .map((cell) => cell.textContent?.replace(/\s/g, ' '))
const unsavedBar = () => screen.queryByRole('region', { name: 'Alterações não salvas' })
const save = () => userEvent.click(within(unsavedBar()!).getByRole('button', { name: 'Salvar' }))

/** Opens the dashboard with the given categories expanded to their launches */
async function openDashboard(...expand: string[]) {
  const result = await renderRoute('/')
  await screen.findByRole('heading', { name: 'Dashboard' })
  for (const category of expand) await userEvent.click(screen.getByRole('button', { name: category }))
  return result
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

/** The tree's API must never be called from the dashboard: everything waits for "Salvar" */
function expectNothingSent() {
  for (const call of [createGroup, updateGroup, deleteGroup, createCategory, updateCategory, deleteCategory]) {
    expect(call).not.toHaveBeenCalled()
  }
  expect(savePlanMock).not.toHaveBeenCalled()
}

describe('Dashboard: managing types and categories', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue(makeAuthUser())
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

  it('renames a category in the plan and saves it with "Salvar"', async () => {
    await openDashboard()

    await rowAction('Moradia', 'Editar')
    const dialog = await screen.findByRole('dialog', { name: 'Editar categoria' })
    expect(within(dialog).queryByRole('textbox', { name: /Descrição/ })).not.toBeInTheDocument()
    const name = within(dialog).getByRole('textbox', { name: 'Nome' })
    expect(name).toHaveValue('Moradia')
    await userEvent.clear(name)
    await userEvent.type(name, 'Casa')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('rowheader', { name: 'Casa' })).toHaveTextContent('Não salvo')
    expect(unsavedBar()).toHaveTextContent('1 alteração não salva')
    expectNothingSent()

    await save()
    expect(savePlanMock).toHaveBeenCalledWith({ updateCategories: [{ id: 1, name: 'Casa' }] })
    await waitFor(() => expect(unsavedBar()).not.toBeInTheDocument())
  })

  it('renames a type and sets its goal, which the goals panel follows before saving', async () => {
    await openDashboard()

    await rowAction('Despesas Básicas', 'Editar')
    const dialog = await screen.findByRole('dialog', { name: 'Editar tipo' })
    const name = within(dialog).getByRole('textbox', { name: 'Nome' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Essenciais')
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Meta/ }), '50')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByRole('rowheader', { name: 'Essenciais' })).toHaveTextContent('Meta 50%')
    const goals = screen.getByRole('region', { name: 'Metas por tipo de despesa' })
    expect(within(goals).getByRole('listitem', { name: 'Essenciais' })).toHaveTextContent('Meta 50%')
    expectNothingSent()

    await save()
    expect(savePlanMock).toHaveBeenCalledWith({ updateGroups: [{ id: 10, name: 'Essenciais', goalPercent: 50 }] })
  })

  it('does not offer a goal for income types, and an unchanged edit is no change', async () => {
    await openDashboard()

    await rowAction('Renda Extra', 'Editar')

    const dialog = await screen.findByRole('dialog', { name: 'Editar tipo' })
    expect(within(dialog).queryByRole('textbox', { name: /Meta/ })).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(unsavedBar()).not.toBeInTheDocument()
  })

  describe('"+ Nova categoria"', () => {
    it('plans a category at the end of the type, ready for launches, and saves both together', async () => {
      await openDashboard()

      await userEvent.click(screen.getByRole('button', { name: 'Nova categoria em Despesas Básicas' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nova categoria' })
      expect(dialog).toHaveTextContent('Em Despesas Básicas.')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Condomínio')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      const names = screen.getAllByRole('rowheader').map((h) => h.getAttribute('aria-label') ?? h.textContent)
      expect(names.slice(1, 5)).toEqual(['Despesas Básicas', 'Moradia', 'Alimentação', 'Condomínio'])
      expect(rowCells('Condomínio')[0]).toBe('R$ 0,00')
      expect(screen.getByRole('rowheader', { name: 'Condomínio' })).toHaveTextContent('Não salvo')

      // Can't be inactivated before it exists
      await userEvent.click(screen.getByRole('button', { name: 'Opções de Condomínio' }))
      expect(screen.queryByRole('menuitem', { name: 'Inativar' })).not.toBeInTheDocument()
      await userEvent.keyboard('{Escape}')

      await userEvent.click(screen.getByRole('button', { name: 'Condomínio' }))
      await userEvent.click(screen.getByRole('button', { name: 'Novo lançamento em Condomínio' }))
      const launch = await screen.findByRole('dialog', { name: 'Nova despesa' })
      expect(within(launch).getByRole('combobox', { name: 'Categoria' })).toHaveDisplayValue('Condomínio')
      await userEvent.type(within(launch).getByRole('textbox', { name: 'Valor previsto (R$)' }), '600')
      await userEvent.click(within(launch).getByRole('button', { name: 'Lançar' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(rowCells('Condomínio')[0]).toBe('R$ 600,00')
      expectNothingSent()

      await save()
      expect(savePlanMock).toHaveBeenCalledWith({
        createCategories: [{ ref: -1, groupId: 10, name: 'Condomínio' }],
        createLines: [{ ref: -2, categoryId: -1, month: '2026-10', plannedCents: 60000 }],
      })
    })

    it('requires a name and rejects a duplicate one right away', async () => {
      await openDashboard()

      await userEvent.click(screen.getByRole('button', { name: 'Nova categoria em Custos de Vida' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nova categoria' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))
      expect(within(dialog).getByText('Informe o nome.')).toBeInTheDocument()

      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), ' Lazer ')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Já existe um item com esse nome.')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(unsavedBar()).not.toBeInTheDocument()
    })
  })

  describe('inactivating', () => {
    it('hides an inactive category, keeps its values in the totals and shows it on demand', async () => {
      await openDashboard('Lazer')
      expect(rowCells('Despesas')[2]).toBe('R$ 300,00')

      await rowAction('Lazer', 'Inativar')

      await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'Lazer' })).not.toBeInTheDocument())
      // History kept: December still counts Lazer's 300,00
      expect(rowCells('Despesas')[2]).toBe('R$ 300,00')
      expect(unsavedBar()).toHaveTextContent('1 alteração não salva')

      await userEvent.click(screen.getByRole('switch', { name: 'Mostrar inativas' }))
      const row = screen.getByRole('rowheader', { name: 'Lazer' })
      expect(row).toHaveTextContent('Inativa')
      expect(row.closest('tr')).toHaveAttribute('data-inactive', 'true')
      // Read-only: its launches are shown as text, not inputs, and take no new ones
      expect(screen.queryByRole('textbox', { name: 'Sem descrição em dezembro de 2026' })).not.toBeInTheDocument()
      expect(rowCells('Sem descrição')[2]).toBe('R$ 300,00')
      expect(screen.queryByRole('button', { name: 'Novo lançamento em Lazer' })).not.toBeInTheDocument()

      // Reactivating undoes the change
      await rowAction('Lazer', 'Reativar')
      expect(await screen.findByRole('textbox', { name: 'Sem descrição em dezembro de 2026' })).toHaveValue('300,00')
      expect(unsavedBar()).not.toBeInTheDocument()
      expectNothingSent()
    })

    it('keeps the typed values of a category it inactivates, saved before it', async () => {
      await openDashboard('Lazer', 'Moradia')
      await typeInCell('Sem descrição em outubro de 2026', '50')
      await typeInCell('Aluguel em outubro de 2026', '10')

      await rowAction('Lazer', 'Inativar')

      await waitFor(() => expect(unsavedBar()).toHaveTextContent('3 alterações não salvas'))
      expect(rowCells('Custos de Vida')[0]).toBe('R$ 50,00')
      await save()
      expect(savePlanMock).toHaveBeenCalledWith({
        updateCategories: [{ id: 3, active: false }],
        cells: [
          { anchorId: 301, month: '2026-10', amountCents: 5000 },
          { anchorId: 101, month: '2026-10', amountCents: 1000 },
        ],
      })
    })

    it('inactivates a whole type, which also stops its categories', async () => {
      await openDashboard('Lazer')

      await rowAction('Custos de Vida', 'Inativar')

      await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'Custos de Vida' })).not.toBeInTheDocument())

      await userEvent.click(screen.getByRole('switch', { name: 'Mostrar inativas' }))
      expect(screen.getByRole('rowheader', { name: 'Custos de Vida' })).toHaveTextContent('Inativo')
      // Its (active) category is read-only and can't get new siblings or launches
      expect(screen.queryByRole('textbox', { name: 'Sem descrição em outubro de 2026' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Novo lançamento em Lazer' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Nova categoria em Custos de Vida' })).not.toBeInTheDocument()

      await save()
      expect(savePlanMock).toHaveBeenCalledWith({ updateGroups: [{ id: 20, active: false }] })
    })
  })

  describe('deleting', () => {
    it('asks before deleting a category, which leaves the grid until saved', async () => {
      await openDashboard()

      await rowAction('Moradia', 'Excluir')
      let dialog = await screen.findByRole('alertdialog', { name: 'Excluir a categoria Moradia?' })
      expect(dialog).toHaveTextContent('valores lançados nesta categoria serão apagados')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      expect(unsavedBar()).not.toBeInTheDocument()

      await rowAction('Moradia', 'Excluir')
      dialog = await screen.findByRole('alertdialog')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }))

      await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'Moradia' })).not.toBeInTheDocument())
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      // Its 1.800,00 leaves the totals
      expect(rowCells('Despesas')[0]).toBe('R$ 700,00')
      expectNothingSent()

      await save()
      expect(savePlanMock).toHaveBeenCalledWith({ deleteCategories: [1] })
    })

    it('deletes a type and forgets the typed values of its categories', async () => {
      await openDashboard('Lazer')
      await typeInCell('Sem descrição em outubro de 2026', '50')

      await rowAction('Custos de Vida', 'Excluir')
      await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }))

      await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'Custos de Vida' })).not.toBeInTheDocument())
      expect(unsavedBar()).toHaveTextContent('1 alteração não salva')
      await save()
      expect(savePlanMock).toHaveBeenCalledWith({ deleteGroups: [20] })
    })

    it('reuses a deleted name in the same plan', async () => {
      await openDashboard()
      await rowAction('Moradia', 'Excluir')
      await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }))

      await userEvent.click(screen.getByRole('button', { name: 'Nova categoria em Despesas Básicas' }))
      const dialog = await screen.findByRole('dialog', { name: 'Nova categoria' })
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Moradia')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await save()
      expect(savePlanMock).toHaveBeenCalledWith({
        createCategories: [{ ref: -1, groupId: 10, name: 'Moradia' }],
        deleteCategories: [1],
      })
    })
  })

  describe('new types from the table header', () => {
    it('plans an expense type with a goal; until saved it can only be edited or deleted', async () => {
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
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))

      const row = await screen.findByRole('rowheader', { name: 'Investimentos' })
      expect(row).toHaveTextContent('Meta 10%')
      expect(row).toHaveTextContent('Não salvo')
      expect(screen.getByRole('button', { name: 'Nova categoria em Investimentos' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Opções de Investimentos' }))
      const menu = await screen.findByRole('menu')
      expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'Editar',
        'Nova categoria',
        'Excluir',
      ])
      await userEvent.keyboard('{Escape}')
      expectNothingSent()

      await save()
      expect(savePlanMock).toHaveBeenCalledWith({
        createGroups: [{ ref: -1, kind: 'EXPENSE', name: 'Investimentos', goalPercent: 10 }],
      })
    })

    it('plans an income type without a goal and rejects a duplicate of the same kind', async () => {
      await openDashboard()

      await userEvent.click(screen.getByRole('button', { name: 'Novo tipo' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Tipo de receita' }))
      const dialog = await screen.findByRole('dialog', { name: 'Novo tipo de receita' })
      expect(within(dialog).queryByRole('textbox', { name: /Meta/ })).not.toBeInTheDocument()
      const name = within(dialog).getByRole('textbox', { name: 'Nome' })
      await userEvent.type(name, 'Salário')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Já existe um item com esse nome.')

      await userEvent.clear(name)
      await userEvent.type(name, 'Aluguéis')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await save()
      expect(savePlanMock).toHaveBeenCalledWith({ createGroups: [{ ref: -1, kind: 'INCOME', name: 'Aluguéis' }] })
    })

    it('forgets a new type deleted before saving', async () => {
      await openDashboard()
      await userEvent.click(screen.getByRole('button', { name: 'Novo tipo' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Tipo de despesa' }))
      const dialog = await screen.findByRole('dialog', { name: 'Novo tipo de despesa' })
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Viagens')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))

      await rowAction('Viagens', 'Excluir')
      await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }))

      await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'Viagens' })).not.toBeInTheDocument())
      expect(unsavedBar()).not.toBeInTheDocument()
    })
  })

  describe('the plan as a whole', () => {
    it('discards every change at once', async () => {
      await openDashboard('Moradia')
      await rowAction('Alimentação', 'Excluir')
      await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }))
      await rowAction('Custos de Vida', 'Inativar')
      await typeInCell('Aluguel em outubro de 2026', '10')
      expect(unsavedBar()).toHaveTextContent('3 alterações não salvas')

      await userEvent.click(within(unsavedBar()!).getByRole('button', { name: 'Descartar' }))

      expect(screen.getByRole('rowheader', { name: 'Alimentação' })).toBeInTheDocument()
      expect(screen.getByRole('rowheader', { name: 'Custos de Vida' })).not.toHaveTextContent('Inativo')
      expect(screen.getByRole('textbox', { name: 'Aluguel em outubro de 2026' })).toHaveValue('1.800,00')
      expect(unsavedBar()).not.toBeInTheDocument()
      expectNothingSent()
    })

    it('keeps the plan and shows the error when saving fails (nothing was saved)', async () => {
      savePlanMock.mockRejectedValue(new ApiError(409, ['An item with this name already exists']))
      await openDashboard()
      await rowAction('Moradia', 'Excluir')
      await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }))

      await save()

      expect(await within(unsavedBar()!).findByRole('alert')).toHaveTextContent(
        'Não foi possível salvar: já existe um item com esse nome.',
      )
      expect(screen.queryByRole('rowheader', { name: 'Moradia' })).not.toBeInTheDocument()
      expect(unsavedBar()).toHaveTextContent('1 alteração não salva')
    })

    it('reloads the saved data after saving', async () => {
      await openDashboard()
      await rowAction('Moradia', 'Excluir')
      await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }))
      vi.mocked(fetchCategories).mockResolvedValue(
        budgetGroups.map((g) => (g.id === 10 ? { ...g, categories: [makeCategory(2, 'Alimentação', 1)] } : g)),
      )

      await save()

      await waitFor(() => expect(unsavedBar()).not.toBeInTheDocument())
      expect(vi.mocked(fetchCategories)).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('rowheader', { name: 'Moradia' })).not.toBeInTheDocument()
    })

    it('asks before leaving the page with structural changes only', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const { router } = await openDashboard()
      await rowAction('Moradia', 'Inativar')

      await userEvent.click(screen.getByRole('link', { name: 'Extrato' }))

      expect(confirm).toHaveBeenCalledWith(UNSAVED_CHANGES_MESSAGE)
      expect(router.state.location.pathname).toBe('/')
      confirm.mockRestore()
    })
  })
})
