import { EyeIcon, EyeOffIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { RowActions, type RowAction } from '@/components/molecules'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { Category, CategoryGroup, EntryKind } from '@/features/budget/types'
import { cn } from '@/lib/utils'

/** What the user asked to do with the category tree; the page handles it. */
export type CategoryAction =
  | { type: 'create-group'; kind: EntryKind }
  | { type: 'toggle-group'; group: CategoryGroup }
  | { type: 'toggle-category'; category: Category }
  | { type: 'edit-group' | 'delete-group' | 'create-category'; group: CategoryGroup }
  | { type: 'edit-category' | 'delete-category'; category: Category }

interface CategoryManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The whole tree, inactive items included */
  groups: CategoryGroup[]
  onAction: (action: CategoryAction) => void
}

const SECTIONS: { kind: EntryKind; label: string; newLabel: string }[] = [
  { kind: 'EXPENSE', label: 'Despesas', newLabel: 'Novo tipo de despesa' },
  { kind: 'INCOME', label: 'Receitas', newLabel: 'Novo tipo de receita' },
]

const toggle = (active: boolean, onSelect: () => void): RowAction =>
  active ? { label: 'Inativar', icon: EyeOffIcon, onSelect } : { label: 'Reativar', icon: EyeIcon, onSelect }

const remove = (onSelect: () => void): RowAction => ({
  label: 'Excluir',
  icon: Trash2Icon,
  destructive: true,
  separated: true,
  onSelect,
})

/**
 * Side panel with the category tree (types and their categories), to create,
 * edit, inactivate or delete them without leaving the page. Every item has a
 * menu (hover "⋯" or right click).
 */
export function CategoryManager({ open, onOpenChange, groups, onAction }: CategoryManagerProps) {
  const groupActions = (group: CategoryGroup): RowAction[] => [
    ...(group.active
      ? [{ label: 'Nova categoria', icon: PlusIcon, onSelect: () => onAction({ type: 'create-category', group }) }]
      : []),
    { label: 'Editar', icon: PencilIcon, onSelect: () => onAction({ type: 'edit-group', group }) },
    toggle(group.active, () => onAction({ type: 'toggle-group', group })),
    remove(() => onAction({ type: 'delete-group', group })),
  ]
  const categoryActions = (category: Category): RowAction[] => [
    { label: 'Editar', icon: PencilIcon, onSelect: () => onAction({ type: 'edit-category', category }) },
    toggle(category.active, () => onAction({ type: 'toggle-category', category })),
    remove(() => onAction({ type: 'delete-category', category })),
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Categorias</SheetTitle>
          <SheetDescription>
            Tipos agrupam categorias. Inativos deixam de receber lançamentos, mas seus valores continuam contando.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 overflow-y-auto p-4">
          {SECTIONS.map(({ kind, label, newLabel }) => (
            <section key={kind} aria-label={label} className="flex flex-col gap-2">
              <header className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{label}</h3>
                <Button variant="outline" size="xs" onClick={() => onAction({ type: 'create-group', kind })}>
                  <PlusIcon aria-hidden />
                  {newLabel}
                </Button>
              </header>
              <ul className="flex flex-col gap-2">
                {groups
                  .filter((g) => g.kind === kind)
                  .map((group) => (
                    <li key={group.id} aria-label={group.name} className="rounded-lg border">
                      <RowActions label={group.name} actions={groupActions(group)}>
                        <div
                          className={cn(
                            'flex min-h-9 items-center gap-2 px-3 font-medium',
                            !group.active && 'text-muted-foreground',
                          )}
                        >
                          <span className="truncate">{group.name}</span>
                          {!group.active && <Badge variant="outline">Inativo</Badge>}
                        </div>
                      </RowActions>
                      {group.categories.length > 0 && (
                        <ul aria-label={`Categorias de ${group.name}`} className="border-t">
                          {group.categories.map((category) => (
                            <li key={category.id} aria-label={category.name}>
                              <RowActions label={category.name} actions={categoryActions(category)}>
                                <div
                                  className={cn(
                                    'flex min-h-8 items-center gap-2 pr-3 pl-6 text-sm',
                                    !category.active && 'text-muted-foreground',
                                  )}
                                >
                                  <span className="truncate">{category.name}</span>
                                  {!category.active && <Badge variant="outline">Inativa</Badge>}
                                </div>
                              </RowActions>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
