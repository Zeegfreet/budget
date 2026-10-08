import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import { createGroupCategory, deleteGroupCategory, fetchGroup, updateGroupCategory } from '@/features/groups/api'
import { ApiError } from '@/lib/api/client'
import { makeGroup, makeGroupCategory, stubGroupsApi } from '@/test/groups'
import { makeAuthUser } from '@/test/auth'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/groups/api')

const panel = () => within(screen.getByRole('region', { name: 'Categorias do grupo' }))
const section = (name: 'Despesas' | 'Receitas') => within(panel().getByRole('region', { name }))

async function openCategories() {
  await renderRoute('/grupos/7?tab=categorias')
  await screen.findByRole('heading', { name: 'República', level: 1 })
}

async function rowAction(name: string, action: string) {
  await userEvent.click(panel().getByRole('button', { name: `Opções de ${name}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: action }))
}

describe('Group categories (/grupos/$groupId?tab=categorias)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue(makeAuthUser())
    stubGroupsApi({
      group: makeGroup({
        categories: [
          makeGroupCategory(20, 'Aluguel'),
          makeGroupCategory(21, 'Antiga', { active: false }),
          makeGroupCategory(23, 'Sublocação', { kind: 'INCOME' }),
        ],
      }),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the categories by kind, marking the inactive ones', async () => {
    await openCategories()

    expect(section('Despesas').getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual([
      'Aluguel',
      'Antiga',
    ])
    expect(section('Despesas').getByRole('listitem', { name: 'Antiga' })).toHaveTextContent('Inativa')
    expect(section('Receitas').getByRole('listitem', { name: 'Sublocação' })).toBeInTheDocument()
  })

  it('shows the empty message of a kind without categories', async () => {
    stubGroupsApi({ group: makeGroup({ categories: [] }) })
    await openCategories()

    expect(section('Despesas').getByText(/Nenhuma categoria de despesa/)).toBeInTheDocument()
    expect(section('Receitas').getByText(/Nenhuma categoria de receita/)).toBeInTheDocument()
  })

  it('creates a category of the chosen kind and refreshes the group', async () => {
    await openCategories()

    await userEvent.click(panel().getByRole('button', { name: 'Nova categoria de receita' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova categoria de receita' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))
    expect(within(dialog).getByText('Informe o nome.')).toBeInTheDocument()
    expect(createGroupCategory).not.toHaveBeenCalled()

    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Vaga')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(createGroupCategory).toHaveBeenCalledWith(7, { kind: 'INCOME', name: 'Vaga' })
    expect(fetchGroup).toHaveBeenCalledTimes(2)
  })

  it('keeps the dialog open on a repeated name', async () => {
    vi.mocked(createGroupCategory).mockRejectedValue(
      new ApiError(409, ['A group category with this name already exists']),
    )
    await openCategories()

    await userEvent.click(panel().getByRole('button', { name: 'Nova categoria de despesa' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova categoria de despesa' })
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Aluguel')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Já existe um item com esse nome.')
  })

  it('renames, inactivates, reactivates and deletes', async () => {
    await openCategories()

    await rowAction('Aluguel', 'Renomear')
    const dialog = await screen.findByRole('dialog', { name: 'Renomear categoria' })
    const name = within(dialog).getByLabelText('Nome')
    expect(name).toHaveValue('Aluguel')
    await userEvent.clear(name)
    await userEvent.type(name, 'Moradia')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(updateGroupCategory).toHaveBeenCalledWith(7, 20, { name: 'Moradia' }))

    await rowAction('Aluguel', 'Inativar')
    await waitFor(() => expect(updateGroupCategory).toHaveBeenCalledWith(7, 20, { active: false }))
    await rowAction('Antiga', 'Reativar')
    await waitFor(() => expect(updateGroupCategory).toHaveBeenCalledWith(7, 21, { active: true }))

    await rowAction('Antiga', 'Excluir')
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir categoria' })
    expect(confirm).toHaveTextContent('passam para a categoria padrão do vínculo')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(deleteGroupCategory).toHaveBeenCalledWith(7, 21))
  })

  it('lets a regular member manage them too', async () => {
    stubGroupsApi({ group: makeGroup({ role: 'MEMBER', categories: [makeGroupCategory(20, 'Aluguel')] }) })
    await openCategories()

    expect(panel().getByRole('button', { name: 'Nova categoria de despesa' })).toBeEnabled()
    expect(panel().getByRole('button', { name: 'Opções de Aluguel' })).toBeInTheDocument()
  })
})
