import { useRef } from 'react'
import {
  ConfirmDialog,
  RealizeDialog,
  RecurrenceScopeDialog,
  TransactionFormDialog,
  type TransactionFormValues,
} from '@/components/molecules'
import type { CategoryGroup, EntryKind, Month } from '@/features/budget/types'
import { transactionErrorMessage } from '@/features/transactions/errors'
import type { useTransactionActions } from '@/features/transactions/hooks'
import { hasFollowing, transactionTitle } from '@/features/transactions/statement'
import type { Transaction, TransactionPatch } from '@/features/transactions/types'

/** The dialog open on the statement, if any */
export type TransactionDialog =
  | { type: 'create'; kind: EntryKind }
  | { type: 'edit' | 'realize' | 'delete'; transaction: Transaction }
  /** Asks whether a change to a recurring transaction also applies to the later ones */
  | { type: 'update-scope'; transaction: Transaction; patch: TransactionPatch }
  | { type: 'delete-scope'; transaction: Transaction }
  | null

interface TransactionDialogsProps {
  dialog: TransactionDialog
  /** Opens another dialog (e.g. the scope question after editing) or closes with `null` */
  onDialogChange: (dialog: TransactionDialog) => void
  month: Month
  groups: CategoryGroup[]
  actions: ReturnType<typeof useTransactionActions>
}

const message = (fallback: string) => (error: unknown) => transactionErrorMessage(error, fallback)

/** Create, edit, realize and delete dialogs of the statement. */
export function TransactionDialogs({ dialog, onDialogChange, month, groups, actions }: TransactionDialogsProps) {
  const close = (open: boolean) => {
    if (!open) onDialogChange(null)
  }
  const transaction = dialog && 'transaction' in dialog ? dialog.transaction : null
  // Set when saving the edit form must lead to the scope question instead of closing
  const afterEdit = useRef<TransactionDialog>(null)
  const closeEdit = (open: boolean) => {
    if (open) return
    onDialogChange(afterEdit.current)
    afterEdit.current = null
  }

  async function saveEdit(t: Transaction, { categoryId, description, plannedCents }: TransactionFormValues) {
    const patch: TransactionPatch = { categoryId, description, plannedCents }
    if (hasFollowing(t)) {
      // The form closes and the scope question takes over
      afterEdit.current = { type: 'update-scope', transaction: t, patch }
      return
    }
    await actions.update(t.id, patch, 'ONE')
  }

  return (
    <>
      <TransactionFormDialog
        open={dialog?.type === 'create'}
        onOpenChange={close}
        kind={dialog?.type === 'create' ? dialog.kind : 'EXPENSE'}
        groups={groups}
        month={month}
        onSubmit={({ repeatMonths, ...values }) =>
          actions.create({ ...values, month, ...(repeatMonths > 1 ? { repeatMonths } : {}) })
        }
        errorMessage={message('Não foi possível lançar.')}
      />
      <TransactionFormDialog
        open={dialog?.type === 'edit'}
        onOpenChange={closeEdit}
        kind={transaction?.category.group.kind ?? 'EXPENSE'}
        groups={groups}
        month={transaction?.month ?? month}
        initial={
          transaction
            ? {
                categoryId: transaction.category.id,
                description: transaction.description,
                plannedCents: transaction.plannedCents,
              }
            : undefined
        }
        onSubmit={(values) => saveEdit(transaction!, values)}
        errorMessage={message('Não foi possível salvar.')}
      />
      <RealizeDialog
        open={dialog?.type === 'realize'}
        onOpenChange={close}
        title={transaction ? transactionTitle(transaction) : ''}
        plannedCents={transaction?.plannedCents ?? 0}
        initialCents={transaction?.realizedCents ?? transaction?.plannedCents ?? 0}
        onSubmit={(cents) => actions.realize(transaction!.id, cents)}
        errorMessage={message('Não foi possível salvar o valor realizado.')}
      />
      <ConfirmDialog
        open={dialog?.type === 'delete'}
        onOpenChange={close}
        title="Excluir lançamento"
        description={
          <>
            Excluir <strong>{transaction ? transactionTitle(transaction) : ''}</strong>? Essa ação não pode ser
            desfeita.
          </>
        }
        confirmLabel="Excluir"
        onConfirm={() => actions.remove(transaction!.id, 'ONE')}
        errorMessage={message('Não foi possível excluir.')}
      />
      <RecurrenceScopeDialog
        open={dialog?.type === 'update-scope'}
        onOpenChange={close}
        action="update"
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
        onChoose={(scope) => actions.remove(transaction!.id, scope)}
        errorMessage={message('Não foi possível excluir.')}
      />
    </>
  )
}
