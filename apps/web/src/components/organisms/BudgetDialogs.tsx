import { CategoryFormDialog, ConfirmDialog, GoalsDialog, type GoalTarget } from '@/components/molecules'
import { categoryErrorMessage } from '@/features/budget/errors'
import type { useCategoryActions } from '@/features/budget/hooks'
import type { CategoryRow, GroupRow } from '@/features/budget/rows'
import type { EntryKind } from '@/features/budget/types'

/** The type a dialog acts on (a grid row or a tree item) */
export type DialogGroup = Pick<GroupRow, 'id' | 'kind' | 'name' | 'goalPercent'> & { categories: { id: number }[] }
/** The category a dialog acts on */
export type DialogCategory = Pick<CategoryRow, 'id' | 'name'>

/** The dialog open on the dashboard (or the statement's category menu), if any */
export type BudgetDialog =
  | { type: 'create-group'; kind: EntryKind }
  | { type: 'edit-group' | 'delete-group' | 'create-category'; group: DialogGroup }
  | { type: 'edit-category' | 'delete-category'; category: DialogCategory }
  | { type: 'goals' }
  | null

interface BudgetDialogsProps {
  dialog: BudgetDialog
  onClose: () => void
  actions: ReturnType<typeof useCategoryActions>
  /** Active expense types, for the goals dialog */
  goalTargets?: GoalTarget[]
}

const KIND_LABEL = { EXPENSE: 'despesa', INCOME: 'receita' } as const

/** Create, edit and delete dialogs of the category tree, plus the goals. */
export function BudgetDialogs({ dialog, onClose, actions, goalTargets = [] }: BudgetDialogsProps) {
  const openChange = (open: boolean) => {
    if (!open) onClose()
  }
  const is = (type: NonNullable<BudgetDialog>['type']) => dialog?.type === type

  return (
    <>
      <CategoryFormDialog
        open={is('create-group')}
        onOpenChange={openChange}
        withGoal={dialog?.type === 'create-group' && dialog.kind === 'EXPENSE'}
        title={dialog?.type === 'create-group' ? `Novo tipo de ${KIND_LABEL[dialog.kind]}` : ''}
        description="Tipos agrupam categorias, por exemplo Despesas Básicas ou Investimentos."
        submitLabel="Criar"
        onSubmit={({ name, goalPercent }) =>
          dialog?.type === 'create-group'
            ? actions.createGroup({ kind: dialog.kind, name, goalPercent })
            : Promise.resolve()
        }
      />
      <CategoryFormDialog
        open={is('edit-group')}
        onOpenChange={openChange}
        withGoal={dialog?.type === 'edit-group' && dialog.group.kind === 'EXPENSE'}
        title="Editar tipo"
        initial={dialog?.type === 'edit-group' ? dialog.group : undefined}
        onSubmit={({ name, goalPercent }) =>
          dialog?.type === 'edit-group'
            ? actions.updateGroup(
                dialog.group.id,
                dialog.group.kind === 'EXPENSE' ? { name, goalPercent } : { name },
              )
            : Promise.resolve()
        }
      />
      <CategoryFormDialog
        open={is('create-category')}
        onOpenChange={openChange}
        title="Nova categoria"
        description={dialog?.type === 'create-category' ? `Em ${dialog.group.name}.` : undefined}
        submitLabel="Criar"
        onSubmit={({ name }) =>
          dialog?.type === 'create-category'
            ? actions.createCategory(dialog.group.id, { name })
            : Promise.resolve()
        }
      />
      <CategoryFormDialog
        open={is('edit-category')}
        onOpenChange={openChange}
        title="Editar categoria"
        initial={dialog?.type === 'edit-category' ? dialog.category : undefined}
        onSubmit={({ name }) =>
          dialog?.type === 'edit-category'
            ? actions.updateCategory(dialog.category.id, { name })
            : Promise.resolve()
        }
      />
      <ConfirmDialog
        open={is('delete-group') || is('delete-category')}
        onOpenChange={openChange}
        title={
          dialog?.type === 'delete-group'
            ? `Excluir o tipo ${dialog.group.name}?`
            : dialog?.type === 'delete-category'
              ? `Excluir a categoria ${dialog.category.name}?`
              : ''
        }
        description={
          dialog?.type === 'delete-group'
            ? 'As categorias deste tipo e todos os valores lançados nelas serão apagados. Para manter o histórico, inative o tipo.'
            : 'Todos os valores lançados nesta categoria serão apagados. Para manter o histórico, inative a categoria.'
        }
        confirmLabel="Excluir"
        errorMessage={(e) => categoryErrorMessage(e, 'Não foi possível excluir.')}
        onConfirm={() =>
          dialog?.type === 'delete-group'
            ? actions.deleteGroup(
                dialog.group.id,
                dialog.group.categories.map((c) => c.id),
              )
            : dialog?.type === 'delete-category'
              ? actions.deleteCategory(dialog.category.id)
              : Promise.resolve()
        }
      />
      <GoalsDialog
        open={is('goals')}
        onOpenChange={openChange}
        groups={goalTargets}
        onSubmit={async (changes) => {
          for (const { id, goalPercent } of changes) await actions.updateGroup(id, { goalPercent })
        }}
      />
    </>
  )
}
