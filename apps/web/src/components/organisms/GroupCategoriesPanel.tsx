import { EyeIcon, EyeOffIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { RowActions } from '@/components/molecules'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { EntryKind } from '@/features/budget/types'
import type { GroupCategory } from '@/features/groups/types'

export type GroupCategoryAction =
  | { type: 'create'; kind: EntryKind }
  | { type: 'edit' | 'delete' | 'toggle'; category: GroupCategory }

interface GroupCategoriesPanelProps {
  categories: GroupCategory[]
  onAction: (action: GroupCategoryAction) => void
}

const SECTIONS: { kind: EntryKind; title: string; empty: string }[] = [
  { kind: 'EXPENSE', title: 'Despesas', empty: 'Nenhuma categoria de despesa, ex.: Aluguel, Mercado, Internet.' },
  { kind: 'INCOME', title: 'Receitas', empty: 'Nenhuma categoria de receita, ex.: Sublocação.' },
]

/**
 * The group's own categories, one level per kind. Each member can link them,
 * one by one, to their own categories in the budget.
 */
export function GroupCategoriesPanel({ categories, onAction }: GroupCategoriesPanelProps) {
  return (
    <Card role="region" aria-label="Categorias do grupo">
      <CardHeader>
        <CardTitle>Categorias do grupo</CardTitle>
        <CardDescription>
          Organize os lançamentos do grupo. No vínculo com o orçamento, cada membro pode levar cada categoria do grupo
          para uma categoria própria.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {SECTIONS.map(({ kind, title, empty }) => {
          const own = categories.filter((c) => c.kind === kind)
          return (
            <section key={kind} aria-label={title} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">{title}</h3>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Nova categoria de ${title.toLowerCase().slice(0, -1)}`}
                  onClick={() => onAction({ type: 'create', kind })}
                >
                  <PlusIcon />
                  Nova categoria
                </Button>
              </div>
              {own.length === 0 ? (
                <p className="text-sm text-muted-foreground">{empty}</p>
              ) : (
                <ul className="divide-y">
                  {own.map((c) => (
                    <li key={c.id} aria-label={c.name} className="py-1">
                      <RowActions
                        label={c.name}
                        actions={[
                          { label: 'Renomear', icon: PencilIcon, onSelect: () => onAction({ type: 'edit', category: c }) },
                          {
                            label: c.active ? 'Inativar' : 'Reativar',
                            icon: c.active ? EyeOffIcon : EyeIcon,
                            onSelect: () => onAction({ type: 'toggle', category: c }),
                          },
                          {
                            label: 'Excluir',
                            icon: Trash2Icon,
                            destructive: true,
                            separated: true,
                            onSelect: () => onAction({ type: 'delete', category: c }),
                          },
                        ]}
                      >
                        <p className="flex min-h-10 items-center gap-2">
                          <span className="truncate">{c.name}</span>
                          {!c.active && <Badge variant="outline">Inativa</Badge>}
                        </p>
                      </RowActions>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </CardContent>
    </Card>
  )
}
