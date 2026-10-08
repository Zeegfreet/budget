import { ConfirmDialog, PaymentMethodFormDialog } from '@/components/molecules'
import { formatMonthLong } from '@/features/budget/months'
import type { Month } from '@/features/budget/types'
import { paymentMethodErrorMessage } from '@/features/payment-methods/errors'
import type { usePaymentMethodActions } from '@/features/payment-methods/hooks'
import type { PaymentMethod, PaymentMethodInput } from '@/features/payment-methods/types'
import { formatCents } from '@/lib/money'

/** The dialog open on the payment method pages, if any */
export type PaymentMethodDialog =
  | { type: 'create' }
  | { type: 'edit' | 'delete'; method: PaymentMethod }
  /** Pays the month's pending launches (`count` of them, `amountCents` in all) or undoes it */
  | { type: 'pay'; method: PaymentMethod; month: Month; count: number; amountCents: number }
  | { type: 'unpay'; method: PaymentMethod; month: Month }
  | null

interface PaymentMethodDialogsProps {
  dialog: PaymentMethodDialog
  onDialogChange: (dialog: PaymentMethodDialog) => void
  actions: ReturnType<typeof usePaymentMethodActions>
  /** After creating (e.g. to open the new method) */
  onCreated?: (method: PaymentMethod) => Promise<void> | void
  /** After deleting (e.g. to leave its page) */
  onDeleted?: (method: PaymentMethod) => Promise<void> | void
}

const message = (fallback: string) => (error: unknown) => paymentMethodErrorMessage(error, fallback)

/** Create, edit, delete and pay/unpay dialogs of the payment method pages. */
export function PaymentMethodDialogs({
  dialog,
  onDialogChange,
  actions,
  onCreated,
  onDeleted,
}: PaymentMethodDialogsProps) {
  const close = (open: boolean) => {
    if (!open) onDialogChange(null)
  }
  const method = dialog && 'method' in dialog ? dialog.method : null
  const initial = (m: PaymentMethod): PaymentMethodInput => ({ name: m.name, type: m.type, dueDay: m.dueDay })

  return (
    <>
      <PaymentMethodFormDialog
        open={dialog?.type === 'create'}
        onOpenChange={close}
        onSubmit={async (values) => {
          const created = await actions.create(values)
          await onCreated?.(created)
        }}
        errorMessage={message('Não foi possível criar o meio de pagamento.')}
      />
      <PaymentMethodFormDialog
        open={dialog?.type === 'edit'}
        onOpenChange={close}
        initial={method ? initial(method) : undefined}
        onSubmit={(values) => actions.update(method!.id, values)}
        errorMessage={message('Não foi possível salvar.')}
      />
      <ConfirmDialog
        open={dialog?.type === 'delete'}
        onOpenChange={close}
        title="Excluir meio de pagamento"
        description={
          <>
            Excluir <strong>{method?.name}</strong>? Os lançamentos continuam no extrato, sem meio de pagamento, e voltam
            a vencer no dia da categoria.
          </>
        }
        confirmLabel="Excluir"
        onConfirm={async () => {
          await actions.remove(method!.id)
          await onDeleted?.(method!)
        }}
        errorMessage={message('Não foi possível excluir.')}
      />
      <ConfirmDialog
        open={dialog?.type === 'pay'}
        onOpenChange={close}
        title="Pagar fatura"
        description={
          dialog?.type === 'pay' ? (
            <>
              Marcar como {dialog.count === 1 ? 'pago o lançamento pendente' : `pagos os ${dialog.count} lançamentos pendentes`}{' '}
              de <strong>{dialog.method.name}</strong> em {formatMonthLong(dialog.month)}, pelo valor previsto (
              {formatCents(dialog.amountCents)})?
            </>
          ) : null
        }
        confirmLabel="Pagar fatura"
        onConfirm={() => (dialog?.type === 'pay' ? actions.pay(dialog.method.id, dialog.month) : Promise.resolve())}
        errorMessage={message('Não foi possível pagar a fatura.')}
      />
      <ConfirmDialog
        open={dialog?.type === 'unpay'}
        onOpenChange={close}
        title="Desfazer pagamento"
        description={
          dialog?.type === 'unpay' ? (
            <>
              Os lançamentos de <strong>{dialog.method.name}</strong> em {formatMonthLong(dialog.month)} voltam a ficar
              pendentes, inclusive os que foram realizados com outro valor.
            </>
          ) : null
        }
        confirmLabel="Desfazer pagamento"
        onConfirm={() => (dialog?.type === 'unpay' ? actions.unpay(dialog.method.id, dialog.month) : Promise.resolve())}
        errorMessage={message('Não foi possível desfazer o pagamento.')}
      />
    </>
  )
}
