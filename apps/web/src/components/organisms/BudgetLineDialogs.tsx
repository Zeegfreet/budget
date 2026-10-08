import { ConfirmDialog, TransactionFormDialog, type TransactionFormValues } from '@/components/molecules'
import { formatMonthLong } from '@/features/budget/months'
import { lineTarget, type LineRow } from '@/features/budget/rows'
import type { CategoryGroup, EntryKind, Month } from '@/features/budget/types'
import type { PaymentMethod } from '@/features/payment-methods/types'
import { transactionErrorMessage } from '@/features/transactions/errors'
import type { useTransactionActions } from '@/features/transactions/hooks'
import type { TransactionPatch } from '@/features/transactions/types'

/** The launch dialog open on the dashboard, if any */
export type LineDialog =
  | { type: 'create-line'; categoryId: number; kind: EntryKind }
  | { type: 'edit-line' | 'delete-line'; line: LineRow; kind: EntryKind }
  | null

interface BudgetLineDialogsProps {
  dialog: LineDialog
  onClose: () => void
  /** New launches start here (the current month) */
  month: Month
  groups: CategoryGroup[]
  paymentMethods?: PaymentMethod[]
  actions: ReturnType<typeof useTransactionActions>
}

const message = (fallback: string) => (error: unknown) => transactionErrorMessage(error, fallback)

/**
 * Launches of the dashboard grid: a new one in a category (saved right away,
 * like in the statement), and editing or deleting a row from its first
 * pending month on (`FOLLOWING`; realized months are kept).
 */
export function BudgetLineDialogs({ dialog, onClose, month, groups, paymentMethods, actions }: BudgetLineDialogsProps) {
  const close = (open: boolean) => {
    if (!open) onClose()
  }
  const row = dialog && 'line' in dialog ? dialog.line : null
  const target = row ? lineTarget(row.line) : null
  const initial =
    row && target
      ? {
          categoryId: row.line.categoryId,
          description: row.line.description,
          plannedCents: target.plannedCents,
          dueDay: row.line.dueDay,
          paymentUrl: row.line.paymentUrl,
          paymentMethodId: row.line.paymentMethod?.id ?? null,
        }
      : undefined

  async function saveEdit(values: TransactionFormValues) {
    if (!initial || !target) return
    // Only what changed, so the later months keep their own amounts and fields
    const patch: TransactionPatch = {}
    if (values.categoryId !== initial.categoryId) patch.categoryId = values.categoryId
    if (values.description !== initial.description) patch.description = values.description
    if (values.plannedCents !== initial.plannedCents) patch.plannedCents = values.plannedCents
    if (values.dueDay !== initial.dueDay) patch.dueDay = values.dueDay
    if (values.paymentUrl !== initial.paymentUrl) patch.paymentUrl = values.paymentUrl
    if (values.paymentMethodId !== initial.paymentMethodId) patch.paymentMethodId = values.paymentMethodId
    if (Object.keys(patch).length > 0) await actions.update(target.transactionId, patch, 'FOLLOWING')
  }

  return (
    <>
      <TransactionFormDialog
        open={dialog?.type === 'create-line'}
        onOpenChange={close}
        kind={dialog?.kind ?? 'EXPENSE'}
        groups={groups}
        month={month}
        paymentMethods={paymentMethods}
        defaultCategoryId={dialog?.type === 'create-line' ? dialog.categoryId : undefined}
        onSubmit={({ repeatMonths, dueDay, paymentUrl, paymentMethodId, ...values }) =>
          actions.create({
            ...values,
            month,
            ...(repeatMonths > 1 ? { repeatMonths } : {}),
            ...(dueDay !== null ? { dueDay } : {}),
            ...(paymentUrl !== null ? { paymentUrl } : {}),
            ...(paymentMethodId !== null ? { paymentMethodId } : {}),
          })
        }
        errorMessage={message('Não foi possível lançar.')}
      />
      <TransactionFormDialog
        open={dialog?.type === 'edit-line'}
        onOpenChange={close}
        kind={dialog?.kind ?? 'EXPENSE'}
        groups={groups}
        month={target?.month ?? month}
        note={target ? `Vale de ${formatMonthLong(target.month)} em diante; meses já realizados não mudam.` : undefined}
        paymentMethods={paymentMethods}
        initial={initial}
        onSubmit={saveEdit}
        errorMessage={message('Não foi possível salvar.')}
      />
      <ConfirmDialog
        open={dialog?.type === 'delete-line'}
        onOpenChange={close}
        title="Excluir lançamento"
        description={
          <>
            Excluir <strong>{row?.label}</strong> de {target ? formatMonthLong(target.month) : ''} em diante? Os
            meses já realizados continuam no extrato.
          </>
        }
        confirmLabel="Excluir"
        onConfirm={() => actions.remove(target!.transactionId, 'FOLLOWING')}
        errorMessage={message('Não foi possível excluir.')}
      />
    </>
  )
}
