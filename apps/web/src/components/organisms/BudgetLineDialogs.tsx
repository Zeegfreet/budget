import { ConfirmDialog, TransactionFormDialog, type TransactionFormValues } from '@/components/molecules'
import { formatMonthLong } from '@/features/budget/months'
import { lineTarget, type LineRow } from '@/features/budget/rows'
import type { LineActions } from '@/features/budget/hooks'
import type { LineMethod } from '@/features/budget/plan'
import type { CategoryGroup, EntryKind, Month } from '@/features/budget/types'
import type { PaymentMethod } from '@/features/payment-methods/types'
import { transactionErrorMessage } from '@/features/transactions/errors'
import type { TransactionPatch } from '@/features/transactions/types'
import { recurrenceRequest } from '@/features/transactions/recurrence'

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
  actions: LineActions
}

const PLAN_NOTE = 'Entra no planejamento e só é gravado ao clicar em Salvar.'

const message = (fallback: string) => (error: unknown) => transactionErrorMessage(error, fallback)

/**
 * Launches of the dashboard grid: a new one in a category, and editing or
 * deleting a row from its first pending month on (`FOLLOWING`; realized
 * months are kept). They go to the plan, saved with the grid.
 */
export function BudgetLineDialogs({ dialog, onClose, month, groups, paymentMethods, actions }: BudgetLineDialogsProps) {
  /** The chosen method as the row shows it until saved */
  const methodOf = (id: number | null): LineMethod => {
    const method = id === null ? undefined : paymentMethods?.find((m) => m.id === id)
    return method ? { id: method.id, name: method.name, dueDay: method.dueDay } : null
  }
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
    if (Object.keys(patch).length > 0 && row) {
      await actions.update(row.line, patch, patch.paymentMethodId !== undefined ? methodOf(values.paymentMethodId) : undefined)
    }
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
        note={`Lançamento previsto para ${formatMonthLong(month)}. ${PLAN_NOTE}`}
        onSubmit={({ repeatMonths, openEnded, adjustment, dueDay, paymentUrl, paymentMethodId, ...values }) =>
          actions.create(
            {
              ...values,
              month,
              ...recurrenceRequest({ repeatMonths, openEnded, adjustment }),
              ...(dueDay !== null ? { dueDay } : {}),
              ...(paymentUrl !== null ? { paymentUrl } : {}),
              ...(paymentMethodId !== null ? { paymentMethodId } : {}),
            },
            methodOf(paymentMethodId),
          )
        }
        errorMessage={message('Não foi possível lançar.')}
      />
      <TransactionFormDialog
        open={dialog?.type === 'edit-line'}
        onOpenChange={close}
        kind={dialog?.kind ?? 'EXPENSE'}
        groups={groups}
        month={target?.month ?? month}
        note={
          target
            ? `Vale de ${formatMonthLong(target.month)} em diante; meses já realizados não mudam. ${PLAN_NOTE}`
            : undefined
        }
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
            meses já realizados continuam no extrato. {PLAN_NOTE}
          </>
        }
        confirmLabel="Excluir"
        onConfirm={() => actions.remove(row!.line)}
        errorMessage={message('Não foi possível excluir.')}
      />
    </>
  )
}
