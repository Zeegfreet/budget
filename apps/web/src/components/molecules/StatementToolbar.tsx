import { ArrowUpDownIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { describeSort, type SortLevel } from '@/features/transactions/view'
import { StatementSortDialog } from './StatementSortDialog'

interface StatementToolbarProps {
  pendingOnly: boolean
  onPendingOnlyChange: (pendingOnly: boolean) => void
  sort: SortLevel[]
  onSortChange: (sort: SortLevel[]) => void
}

/** Commands above the statement list: showing only what is pending and the ordering. */
export function StatementToolbar({ pendingOnly, onPendingOnlyChange, sort, onSortChange }: StatementToolbarProps) {
  const id = useId()
  const [sorting, setSorting] = useState(false)
  const description = describeSort(sort)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Switch id={id} checked={pendingOnly} onCheckedChange={onPendingOnlyChange} />
        <Label htmlFor={id} className="font-normal">
          Somente pendentes
        </Label>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="max-w-full min-w-0"
        aria-label={`Ordenar: ${description}`}
        onClick={() => setSorting(true)}
      >
        <ArrowUpDownIcon aria-hidden />
        <span className="truncate">
          <span className="font-medium">Ordenar:</span> {description}
        </span>
      </Button>
      <StatementSortDialog open={sorting} onOpenChange={setSorting} sort={sort} onSubmit={onSortChange} />
    </div>
  )
}
