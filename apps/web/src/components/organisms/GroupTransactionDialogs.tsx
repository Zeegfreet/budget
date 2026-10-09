import { useRef } from 'react'
import {
  ConfirmDialog,
  GroupTransactionFormDialog,
  PaymentDialog,
  RecurrenceScopeDialog,
  SeriesRangeDialog,
  type GroupTransactionFormValues,
} from '@/components/molecules'
import type { EntryKind, Month } from '@/features/budget/types'
import { groupErrorMessage, groupSeriesErrorMessage } from '@/features/groups/errors'
import type { useGroupTransactionActions } from '@/features/groups/hooks'
import { hasFollowing } from '@/features/groups/series'
import type {
  FinanceGroup,
  GroupTransaction,
  GroupTransactionPatch,
  SplitMethod,
} from '@/features/groups/types'
import { recurrenceRequest, scopeNote } from '@/features/transactions/recurrence'

/** The dialog open for the group's transactions, if any */
export type GroupTransactionDialog =
  | { type: 'create'; kind: EntryKind }
  | { type: 'edit' | 'pay' | 'delete' | 'series'; transaction: GroupTransaction }
  /** Asks whether a change to a recurring transaction also applies to the later ones */
  | { type: 'update-scope'; transaction: GroupTransaction; patch: GroupTransactionPatch }
  | { type: 'delete-scope'; transaction: GroupTransaction }
  | null

interface GroupTransactionDialogsProps {
  dialog: GroupTransactionDialog
  onDialogChange: (dialog: GroupTransactionDialog) => void
  group: FinanceGroup
  splitMethods: SplitMethod[]
  month: Month
  actions: ReturnType<typeof useGroupTransactionActions>
}

const message = (fallback: string) => (error: unknown) => groupErrorMessage(error, fallback)

/** Create, edit, pay, delete and recurrence range dialogs of a group's transactions. */
export function GroupTransactionDialogs({
  dialog,
  onDialogChange,
  group,
  splitMethods,
  month,
  actions,
}: GroupTransactionDialogsProps) {
  const close = (open: boolean) => {
    if (!open) onDialogChange(null)
  }
  const transaction = dialog && 'transaction' in dialog ? dialog.transaction : null
  // Set when saving the edit form must lead to the scope question instead of closing
  const afterEdit = useRef<GroupTransactionDialog>(null)
  const closeEdit = (open: boolean) => {
    if (open) return
    onDialogChange(afterEdit.current)
    afterEdit.current = null
  }

  async function saveEdit(
    t: GroupTransaction,
    { description, amountCents, splitMethodId, dueDay, paymentUrl, categoryId }: GroupTransactionFormValues,
  ) {
    const patch: GroupTransactionPatch = { description, amountCents, splitMethodId }
    // Sent only when they change, so editing other fields keeps them as they are
    if (dueDay !== t.dueDay) patch.dueDay = dueDay
    if (paymentUrl !== t.paymentUrl) patch.paymentUrl = paymentUrl
    if (categoryId !== (t.category?.id ?? null)) patch.categoryId = categoryId
    if (hasFollowing(t)) {
      afterEdit.current = { type: 'update-scope', transaction: t, patch }
      return
    }
    await actions.update(t.id, patch, 'ONE')
  }

  return (
    <>
      <GroupTransactionFormDialog
        open={dialog?.type === 'create'}
        onOpenChange={close}
        kind={dialog?.type === 'create' ? dialog.kind : 'EXPENSE'}
        month={month}
        members={group.members}
        splitMethods={splitMethods}
        categories={group.categories}
        onSubmit={({ repeatMonths, openEnded, adjustment, paidByMemberId, dueDay, paymentUrl, categoryId, ...values }) =>
          actions.create({
            ...values,
            kind: dialog?.type === 'create' ? dialog.kind : 'EXPENSE',
            month,
            ...(paidByMemberId !== null ? { paidByMemberId } : {}),
            ...(dueDay !== null ? { dueDay } : {}),
            ...(paymentUrl !== null ? { paymentUrl } : {}),
            ...(categoryId !== null ? { categoryId } : {}),
            ...recurrenceRequest({ repeatMonths, openEnded, adjustment }),
          })
        }
        errorMessage={message('Não foi possível lançar.')}
      />
      <GroupTransactionFormDialog
        open={dialog?.type === 'edit'}
        onOpenChange={closeEdit}
        kind={transaction?.kind ?? 'EXPENSE'}
        month={transaction?.month ?? month}
        members={group.members}
        splitMethods={splitMethods}
        categories={group.categories}
        initial={
          transaction
            ? {
                description: transaction.description,
                amountCents: transaction.amountCents,
                splitMethodId: transaction.splitMethod?.id ?? null,
                dueDay: transaction.dueDay,
                paymentUrl: transaction.paymentUrl,
                categoryId: transaction.category?.id ?? null,
              }
            : undefined
        }
        onSubmit={(values) => saveEdit(transaction!, values)}
        errorMessage={message('Não foi possível salvar.')}
      />
      <PaymentDialog
        open={dialog?.type === 'pay'}
        onOpenChange={close}
        kind={transaction?.kind ?? 'EXPENSE'}
        title={transaction?.description ?? ''}
        amountCents={transaction?.amountCents ?? 0}
        members={group.members}
        initialMemberId={
          group.members.some((m) => m.id === transaction?.paidBy?.memberId)
            ? transaction!.paidBy!.memberId
            : group.memberId
        }
        onSubmit={(memberId) => actions.pay(transaction!.id, memberId)}
        errorMessage={message('Não foi possível registrar o pagamento.')}
      />
      <ConfirmDialog
        open={dialog?.type === 'delete'}
        onOpenChange={close}
        title="Excluir lançamento"
        description={
          <>
            Excluir <strong>{transaction?.description}</strong>? Essa ação não pode ser desfeita.
          </>
        }
        confirmLabel="Excluir"
        onConfirm={() => actions.remove(transaction!.id, 'ONE')}
        errorMessage={message('Não foi possível excluir.')}
      />
      <SeriesRangeDialog
        open={dialog?.type === 'series'}
        onOpenChange={close}
        title={transaction?.description ?? ''}
        series={transaction?.series ?? null}
        settledLabel="pagos"
        onSubmit={(change) => actions.setSeriesEnd(transaction!.id, change)}
        errorMessage={groupSeriesErrorMessage}
      />
      <RecurrenceScopeDialog
        open={dialog?.type === 'update-scope'}
        onOpenChange={close}
        action="update"
        note={
          dialog?.type === 'update-scope'
            ? scopeNote(
                dialog.transaction.series,
                'update',
                dialog.patch.amountCents !== undefined && dialog.patch.amountCents !== dialog.transaction.amountCents,
              )
            : undefined
        }
        onChoose={(scope) =>
          dialog?.type === 'update-scope'
            ? actions.update(dialog.transaction.id, dialog.patch, scope)
            : Promise.resolve()
        }
        errorMessage={message('Não foi possível salvar.')}
      />
      <RecurrenceScopeDialog
        open={dialog?.type === 'delete-scope'}
        onOpenChange={close}
        action="delete"
        note={scopeNote(transaction?.series, 'delete')}
        onChoose={(scope) => actions.remove(transaction!.id, scope)}
        errorMessage={message('Não foi possível excluir.')}
      />
    </>
  )
}
