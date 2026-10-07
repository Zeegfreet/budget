import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { RowActions } from '@/components/molecules'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { describeRule, SPLIT_TYPE_LABEL } from '@/features/groups/split'
import type { GroupMember, SplitMethod } from '@/features/groups/types'

export type SplitMethodAction = { type: 'create' } | { type: 'edit' | 'delete'; method: SplitMethod }

interface SplitMethodsPanelProps {
  methods: SplitMethod[]
  members: GroupMember[]
  onAction: (action: SplitMethodAction) => void
}

/** The group's split rules and how each divides an amount. */
export function SplitMethodsPanel({ methods, members, onAction }: SplitMethodsPanelProps) {
  return (
    <Card role="region" aria-label="Regras de rateio">
      <CardHeader>
        <CardTitle>Regras de rateio</CardTitle>
        <CardDescription>
          Cada lançamento usa uma regra para dividir o valor entre os membros. Alterar uma regra não muda os
          lançamentos já feitos.
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => onAction({ type: 'create' })}>
            <PlusIcon />
            Nova regra
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {methods.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma regra. Crie uma para lançar despesas e receitas.</p>
        ) : (
          <ul className="divide-y">
            {methods.map((m) => (
              <li key={m.id} aria-label={m.name} className="py-2 first:pt-0 last:pb-0">
                <RowActions
                  label={m.name}
                  actions={[
                    { label: 'Editar', icon: PencilIcon, onSelect: () => onAction({ type: 'edit', method: m }) },
                    {
                      label: 'Excluir',
                      icon: Trash2Icon,
                      destructive: true,
                      separated: true,
                      onSelect: () => onAction({ type: 'delete', method: m }),
                    },
                  ]}
                >
                  <div className="flex min-h-10 flex-col justify-center">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{m.name}</span>
                      <Badge variant="secondary">{SPLIT_TYPE_LABEL[m.type]}</Badge>
                      {!m.active && (
                        <Badge variant="outline" title="Um membro desta regra saiu do grupo. Edite-a para usá-la.">
                          Inativa
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{describeRule(m.type, m.shares, members)}</p>
                  </div>
                </RowActions>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
