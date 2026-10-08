import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import {
  createGroupTransaction,
  deleteGroupTransaction,
  fetchGroupBalance,
  fetchGroupTransactions,
  payGroupTransaction,
  setGroupTransactionSeriesEnd,
  unpayGroupTransaction,
  updateGroupTransaction,
} from '@/features/groups/api'
import { ApiError } from '@/lib/api/client'
import { makeSplitMethod, rentTransaction, stubGroupsApi, waterTransaction } from '@/test/groups'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/groups/api')

const region = (name: string) => screen.getByRole('region', { name })
const row = (name: string) => screen.getByRole('listitem', { name })

async function openGroup(path = '/grupos/7') {
  const result = await renderRoute(path)
  await screen.findByRole('heading', { name: 'República', level: 1 })
  return result
}

async function rowAction(title: string, action: string) {
  await userEvent.click(screen.getByRole('button', { name: `Opções de ${title}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: action }))
}

describe('Group route (/grupos/$groupId)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue({ id: 1, name: 'Ana Souza', email: 'ana@example.com' })
    stubGroupsApi()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('transactions', () => {
    it('lists the month’s incomes and expenses with their split and payer', async () => {
      await openGroup()

      expect(fetchGroupTransactions).toHaveBeenCalledWith(7, '2026-10')
      expect(screen.getByText('2 membros · Rua A, 10')).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Lançamentos' })).toHaveAttribute('aria-selected', 'true')
      expect(region('Receitas').compareDocumentPosition(region('Despesas'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)

      const rent = within(row('Aluguel'))
      expect(rent.getByText('1/12')).toBeInTheDocument()
      expect(row('Aluguel')).toHaveTextContent(/Aluguel 30\/70 · Ana R\$\s600,00 · Bruno R\$\s1\.400,00/)
      expect(rent.getByText('Pago por Ana')).toBeInTheDocument()
      expect(within(row('Água')).getByText('A pagar')).toBeInTheDocument()
      expect(within(row('Sublocação')).getByText('A receber')).toBeInTheDocument()
      expect(within(region('Despesas')).getByRole('banner')).toHaveTextContent(/R\$\s2\.100,00/)
    })

    it('shows an empty month', async () => {
      vi.mocked(fetchGroupTransactions).mockResolvedValue([])
      await openGroup('/grupos/7?month=2026-12')

      expect(screen.getByText('Nenhum lançamento em dezembro de 2026')).toBeInTheDocument()
    })

    it('moves to other months', async () => {
      const { router } = await openGroup()

      await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))

      await waitFor(() => expect(router.state.location.search).toEqual({ month: '2026-11' }))
      expect(fetchGroupTransactions).toHaveBeenCalledWith(7, '2026-11')
      expect(fetchGroupBalance).toHaveBeenCalledWith(7, '2026-11')
    })

    it('creates a recurring expense paid by a member, previewing the split', async () => {
      await openGroup()

      await userEvent.click(screen.getAllByRole('button', { name: 'Nova despesa' })[0])
      const dialog = await screen.findByRole('dialog', { name: 'Nova despesa do grupo' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))
      expect(within(dialog).getByText('Informe a descrição.')).toBeInTheDocument()
      expect(within(dialog).getByText('Informe um valor maior que zero.')).toBeInTheDocument()

      await userEvent.type(within(dialog).getByLabelText('Descrição'), 'Luz')
      await userEvent.type(within(dialog).getByLabelText('Valor (R$)'), '300')
      await userEvent.selectOptions(within(dialog).getByLabelText('Regra de rateio'), 'Aluguel 30/70')
      expect(within(dialog).getByLabelText('Divisão')).toHaveTextContent(/Ana R\$\s90,00 · Bruno R\$\s210,00/)
      await userEvent.selectOptions(within(dialog).getByLabelText('Pago por'), 'Bruno')
      await userEvent.click(within(dialog).getByRole('switch', { name: 'Repetir nos próximos meses' }))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(createGroupTransaction).toHaveBeenCalledWith(7, {
        kind: 'EXPENSE',
        description: 'Luz',
        month: '2026-10',
        amountCents: 30000,
        splitMethodId: 2,
        paidByMemberId: 2,
        repeatMonths: 12,
      })
    })

    it('blocks an amount that a fixed rule cannot split', async () => {
      stubGroupsApi({
        splitMethods: [
          makeSplitMethod(3, {
            name: 'Fixo',
            type: 'FIXED',
            shares: [
              { memberId: 1, value: 40000 },
              { memberId: 2, value: 60000 },
            ],
          }),
        ],
      })
      await openGroup()

      await userEvent.click(screen.getAllByRole('button', { name: 'Nova despesa' })[0])
      const dialog = await screen.findByRole('dialog', { name: 'Nova despesa do grupo' })
      await userEvent.type(within(dialog).getByLabelText('Descrição'), 'Aluguel')
      await userEvent.type(within(dialog).getByLabelText('Valor (R$)'), '900')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      expect(within(dialog).getByText(/O valor deve ser R\$\s1\.000,00/)).toBeInTheDocument()
      expect(createGroupTransaction).not.toHaveBeenCalled()
    })

    it('creates a pending income with the default rule', async () => {
      await openGroup()

      await userEvent.click(screen.getAllByRole('button', { name: 'Nova receita' })[0])
      const dialog = await screen.findByRole('dialog', { name: 'Nova receita do grupo' })
      await userEvent.type(within(dialog).getByLabelText('Descrição'), 'Vaga')
      await userEvent.type(within(dialog).getByLabelText('Valor (R$)'), '100,01')
      expect(within(dialog).getByLabelText('Divisão')).toHaveTextContent(/Ana R\$\s50,01 · Bruno R\$\s50,00/)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      await waitFor(() =>
        expect(createGroupTransaction).toHaveBeenCalledWith(7, {
          kind: 'INCOME',
          description: 'Vaga',
          month: '2026-10',
          amountCents: 10001,
          splitMethodId: 1,
        }),
      )
    })

    it('shows the API error in the form', async () => {
      vi.mocked(createGroupTransaction).mockRejectedValue(new ApiError(400, ['Split method is inactive']))
      await openGroup()

      await userEvent.click(screen.getAllByRole('button', { name: 'Nova despesa' })[0])
      const dialog = await screen.findByRole('dialog', { name: 'Nova despesa do grupo' })
      await userEvent.type(within(dialog).getByLabelText('Descrição'), 'Luz')
      await userEvent.type(within(dialog).getByLabelText('Valor (R$)'), '10')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lançar' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Esta regra de rateio está inativa. Edite-a antes de usar.',
      )
    })

    it('marks an expense as paid by a member and undoes it', async () => {
      await openGroup()

      await userEvent.click(within(row('Água')).getByRole('button', { name: 'Marcar como pago: Água' }))
      const dialog = await screen.findByRole('dialog', { name: 'Marcar como pago' })
      expect(within(dialog).getByLabelText('Pago por')).toHaveValue('1')
      await userEvent.selectOptions(within(dialog).getByLabelText('Pago por'), 'Bruno')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }))

      await waitFor(() => expect(payGroupTransaction).toHaveBeenCalledWith(7, waterTransaction.id, 2))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      await rowAction('Aluguel', 'Desfazer pagamento')
      await waitFor(() => expect(unpayGroupTransaction).toHaveBeenCalledWith(7, rentTransaction.id))
    })

    it('edits one occurrence of a series or the following ones', async () => {
      await openGroup()

      await rowAction('Aluguel', 'Editar')
      const dialog = await screen.findByRole('dialog', { name: 'Editar lançamento do grupo' })
      expect(within(dialog).getByLabelText('Valor (R$)')).toHaveValue('2.000,00')
      expect(within(dialog).getByLabelText('Regra de rateio')).toHaveValue('2')
      expect(within(dialog).queryByLabelText('Pago por')).not.toBeInTheDocument()
      await userEvent.clear(within(dialog).getByLabelText('Valor (R$)'))
      await userEvent.type(within(dialog).getByLabelText('Valor (R$)'), '2200')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      const scope = await screen.findByRole('alertdialog', { name: 'Alterar lançamento recorrente' })
      await userEvent.click(within(scope).getByRole('button', { name: 'Alterar também os próximos' }))

      await waitFor(() =>
        expect(updateGroupTransaction).toHaveBeenCalledWith(
          7,
          rentTransaction.id,
          { description: 'Aluguel', amountCents: 220000, splitMethodId: 2 },
          'FOLLOWING',
        ),
      )
    })

    it('deletes a single transaction after confirming', async () => {
      await openGroup()

      await rowAction('Água', 'Excluir')
      const confirm = await screen.findByRole('alertdialog', { name: 'Excluir lançamento' })
      await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }))

      await waitFor(() => expect(deleteGroupTransaction).toHaveBeenCalledWith(7, waterTransaction.id, 'ONE'))
    })

    it('asks whether to delete the following occurrences too', async () => {
      await openGroup()

      await rowAction('Aluguel', 'Excluir')
      const scope = await screen.findByRole('alertdialog', { name: 'Excluir lançamento recorrente' })
      await userEvent.click(within(scope).getByRole('button', { name: 'Excluir só este' }))

      await waitFor(() => expect(deleteGroupTransaction).toHaveBeenCalledWith(7, rentTransaction.id, 'ONE'))
    })
  })

  describe('recurrence range', () => {
    const openRange = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Recorrência de Aluguel: 1 de 12' }))
      return screen.findByRole('dialog', { name: 'Período da recorrência' })
    }

    it('extends a series from its badge', async () => {
      await openGroup()

      const dialog = await openRange()
      expect(dialog).toHaveTextContent('Aluguel: parcela 1 de 12, de out/26 a set/27.')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Próximo mês' }))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(setGroupTransactionSeriesEnd).toHaveBeenCalledWith(7, 10, '2027-10')
      expect(fetchGroupTransactions).toHaveBeenCalledTimes(2)
    })

    it('shortens a series, showing the conflict when a later one was paid', async () => {
      vi.mocked(setGroupTransactionSeriesEnd).mockRejectedValueOnce(
        new ApiError(409, ['An occurrence after untilMonth is already settled']),
      )
      await openGroup()

      const dialog = await openRange()
      expect(dialog).not.toHaveTextContent('realizados')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Mês anterior' }))
      expect(within(dialog).getByRole('status')).toHaveTextContent('Os já pagos não podem ser removidos')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Há lançamentos já pagos depois desse mês')
      expect(setGroupTransactionSeriesEnd).toHaveBeenCalledWith(7, 10, '2027-08')
    })

    it('shows no badge button for single transactions', async () => {
      await openGroup()

      expect(within(row('Água')).queryByRole('button', { name: /Recorrência/ })).not.toBeInTheDocument()
    })
  })

  describe('balance', () => {
    it('shows each member’s share, payments and who owes whom', async () => {
      const { router } = await openGroup()

      await userEvent.click(screen.getByRole('tab', { name: 'Balanço' }))
      await waitFor(() => expect(router.state.location.search).toEqual({ tab: 'balanco' }))

      expect(within(region('Despesas do mês')).getByText(/2\.100,00/)).toBeInTheDocument()
      expect(within(region('Em aberto')).getByText(/140,00/)).toBeInTheDocument()
      const members = within(region('Balanço por membro'))
      const anaRow = members.getByRole('row', { name: 'Ana' })
      expect(anaRow).toHaveTextContent('Você')
      expect(anaRow).toHaveTextContent(/630,00.*2\.000,00.*1\.400,00a receber/)
      expect(members.getByRole('row', { name: 'Bruno' })).toHaveTextContent(/1\.400,00deve/)
      expect(region('Acerto do mês')).toHaveTextContent(/Bruno paga R\$\s1\.400,00 para Ana/)
    })

    it('says when nobody owes anything', async () => {
      stubGroupsApi({
        balance: {
          month: '2026-10',
          incomeCents: 0,
          expenseCents: 0,
          pendingCents: 0,
          members: [],
          transfers: [],
        },
      })
      await openGroup('/grupos/7?tab=balanco')

      expect(within(region('Acerto do mês')).getByText('Ninguém deve nada neste mês.')).toBeInTheDocument()
    })
  })
})
