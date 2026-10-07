import { ChevronDownIcon, PlusIcon } from 'lucide-react'
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { EntryKind } from '@/features/budget/types'

interface BudgetGridToolbarProps {
  showInactive: boolean
  onShowInactiveChange: (show: boolean) => void
  onCreateGroup: (kind: EntryKind) => void
}

/** Commands above the budget grid: new types and showing inactive rows. */
export function BudgetGridToolbar({ showInactive, onShowInactiveChange, onCreateGroup }: BudgetGridToolbarProps) {
  const id = useId()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Switch id={id} checked={showInactive} onCheckedChange={onShowInactiveChange} />
        <Label htmlFor={id} className="font-normal">
          Mostrar inativas
        </Label>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <PlusIcon aria-hidden />
            Novo tipo
            <ChevronDownIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onCreateGroup('EXPENSE')}>Tipo de despesa</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCreateGroup('INCOME')}>Tipo de receita</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
