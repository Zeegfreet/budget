import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import { createSplitMethod, deleteSplitMethod, updateSplitMethod } from '@/features/groups/api'
import { ApiError } from '@/lib/api/client'
import { equalRule, makeSplitMethod, percentRule, stubGroupsApi } from '@/test/groups'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/groups/api')

const rules = () => within(screen.getByRole('region', { name: 'Regras de rateio' }))

async function openRules() {
  const result = await renderRoute('/grupos/7?tab=rateio')
  await screen.findByRole('heading', { name: 'República', level: 1 })
  return result
}

async function newRule(name: string, type: string) {
  await userEvent.click(rules().getByRole('button', { name: 'Nova regra' }))
  const dialog = await screen.findByRole('dialog', { name: 'Nova regra de rateio' })
  await userEvent.type(within(dialog).getByLabelText('Nome'), name)
  await userEvent.selectOptions(within(dialog).getByLabelText('Tipo'), type)
  return dialog
}

describe('Group split rules (/grupos/$groupId?tab=rateio)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue({ id: 1, name: 'Ana Souza', email: 'ana@example.com' })
    stubGroupsApi({
      splitMethods: [
        equalRule,
        percentRule,
        makeSplitMethod(3, { name: 'Antiga', type: 'WEIGHT', active: false, shares: [{ memberId: 2, value: 2 }] }),
      ],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the rules with their type and distribution', async () => {
    await openRules()

    expect(rules().getByRole('listitem', { name: 'Igualitário' })).toHaveTextContent('Todos os membros, em partes iguais')
    expect(rules().getByRole('listitem', { name: 'Aluguel 30/70' })).toHaveTextContent(
      /PercentualAna 30% · Bruno 70%/,
    )
    expect(rules().getByRole('listitem', { name: 'Antiga' })).toHaveTextContent(/PesosInativaBruno 2/)
  })

  it('creates a percentage rule, checking it adds up to 100%', async () => {
    await openRules()

    const dialog = await newRule('Quartos', 'Percentual')
    await userEvent.type(within(dialog).getByLabelText('Ana'), '15')
    await userEvent.type(within(dialog).getByLabelText('Bruno'), '30')
    expect(within(dialog).getByText(/Total: 45% de 100%/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar regra' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Os percentuais somam 45%, e devem somar 100%.')
    expect(createSplitMethod).not.toHaveBeenCalled()

    await userEvent.clear(within(dialog).getByLabelText('Bruno'))
    await userEvent.type(within(dialog).getByLabelText('Bruno'), '85')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar regra' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(createSplitMethod).toHaveBeenCalledWith(7, {
      name: 'Quartos',
      type: 'PERCENT',
      shares: [
        { memberId: 1, value: 1500 },
        { memberId: 2, value: 8500 },
      ],
    })
  })

  it('creates an equal rule among some members', async () => {
    await openRules()

    const dialog = await newRule('Só Bruno', 'Igualitário')
    await userEvent.click(within(dialog).getByRole('switch', { name: /Todos os membros/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar regra' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Escolha ao menos um participante.')

    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Bruno' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar regra' }))

    await waitFor(() =>
      expect(createSplitMethod).toHaveBeenCalledWith(7, {
        name: 'Só Bruno',
        type: 'EQUAL',
        shares: [{ memberId: 2, value: 1 }],
      }),
    )
  })

  it('creates fixed-value and weight rules, leaving out blank members', async () => {
    await openRules()

    let dialog = await newRule('Fixo', 'Valores fixos')
    await userEvent.type(within(dialog).getByLabelText('Ana'), '400')
    await userEvent.type(within(dialog).getByLabelText('Bruno'), '600,50')
    expect(within(dialog).getByText(/Total:/)).toHaveTextContent(/R\$\s1\.000,50/)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar regra' }))
    await waitFor(() =>
      expect(createSplitMethod).toHaveBeenLastCalledWith(7, {
        name: 'Fixo',
        type: 'FIXED',
        shares: [
          { memberId: 1, value: 40000 },
          { memberId: 2, value: 60050 },
        ],
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    dialog = await newRule('Por quarto', 'Pesos')
    await userEvent.type(within(dialog).getByLabelText('Ana'), '2')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar regra' }))
    await waitFor(() =>
      expect(createSplitMethod).toHaveBeenLastCalledWith(7, {
        name: 'Por quarto',
        type: 'WEIGHT',
        shares: [{ memberId: 1, value: 2 }],
      }),
    )
  })

  it('edits a rule from its current values', async () => {
    await openRules()

    await userEvent.click(rules().getByRole('button', { name: 'Opções de Aluguel 30/70' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Editar regra de rateio' })
    expect(within(dialog).getByLabelText('Ana')).toHaveValue('30')
    expect(within(dialog).getByLabelText('Bruno')).toHaveValue('70')
    await userEvent.clear(within(dialog).getByLabelText('Ana'))
    await userEvent.type(within(dialog).getByLabelText('Ana'), '33,33')
    await userEvent.clear(within(dialog).getByLabelText('Bruno'))
    await userEvent.type(within(dialog).getByLabelText('Bruno'), '66,67')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(updateSplitMethod).toHaveBeenCalledWith(7, percentRule.id, {
        name: 'Aluguel 30/70',
        type: 'PERCENT',
        shares: [
          { memberId: 1, value: 3333 },
          { memberId: 2, value: 6667 },
        ],
      }),
    )
  })

  it('refreshes the personal budget after a rule change, since pending shares are divided again', async () => {
    const { queryClient } = await openRules()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await userEvent.click(rules().getByRole('button', { name: 'Opções de Aluguel 30/70' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Editar regra de rateio' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['budget'] }))
  })

  it('explains an inactive rule when editing it', async () => {
    await openRules()

    await userEvent.click(rules().getByRole('button', { name: 'Opções de Antiga' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar' }))

    expect(await screen.findByRole('dialog', { name: 'Editar regra de rateio' })).toHaveTextContent(
      'Esta regra está inativa porque um membro saiu do grupo.',
    )
  })

  it('shows a duplicate name error from the API', async () => {
    vi.mocked(createSplitMethod).mockRejectedValue(
      new ApiError(409, ['A split method with this name already exists']),
    )
    await openRules()

    const dialog = await newRule('Igualitário', 'Igualitário')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar regra' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Já existe uma regra com esse nome.')
  })

  it('deletes a rule after confirming', async () => {
    await openRules()

    await userEvent.click(rules().getByRole('button', { name: 'Opções de Aluguel 30/70' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Excluir' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir regra' })
    expect(confirm).toHaveTextContent('mantêm a divisão já feita')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(deleteSplitMethod).toHaveBeenCalledWith(7, percentRule.id))
  })
})
