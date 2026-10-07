import { ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'
import { MoneyText } from '@/components/atoms'
import { BudgetCell, type FillScope } from '@/components/molecules'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { endOfYear, formatMonthLabel, formatMonthLong } from '@/features/budget/months'
import type { BudgetTable } from '@/features/budget/rows'
import type { Month } from '@/features/budget/types'
import { cn } from '@/lib/utils'

interface BudgetGridProps {
  table: BudgetTable
  /** Columns; the first one is the current month */
  months: Month[]
  isChanged: (categoryId: number, month: Month) => boolean
  onChange: (categoryId: number, month: Month, cents: number) => void
  onFill: (categoryId: number, month: Month, scope: FillScope) => void
}

const STICKY = 'sticky left-0 z-10'

function ToggleLabel({
  label,
  expanded,
  onToggle,
  className,
}: {
  label: string
  expanded: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className={cn('flex w-full items-center gap-1 text-left outline-none focus-visible:underline', className)}
    >
      <ChevronRightIcon
        aria-hidden
        className={cn('size-4 shrink-0 transition-transform', expanded && 'rotate-90')}
      />
      {label}
    </button>
  )
}

function TotalCells({ values, className }: { values: number[]; className?: string }) {
  return values.map((cents, i) => (
    <TableCell key={i} className={cn('px-3 text-right', i === 0 && 'bg-primary/5', className)}>
      <MoneyText cents={cents} />
    </TableCell>
  ))
}

/**
 * Pivot table of the budget: Despesas and Receitas, each expandable into
 * types and then categories, one editable column per month.
 */
export function BudgetGrid({ table, months, isChanged, onChange, onFill }: BudgetGridProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const lastMonth = months[months.length - 1]
  let row = 0

  return (
    <Table aria-label="Planejamento mensal" className="min-w-max">
      <TableHeader>
        <TableRow>
          <TableHead className={cn(STICKY, 'min-w-56 bg-background')}>Categoria</TableHead>
          {months.map((month, i) => (
            <TableHead
              key={month}
              scope="col"
              aria-label={formatMonthLong(month)}
              className={cn('min-w-32 text-right', i === 0 && 'bg-primary/5 text-primary')}
            >
              {formatMonthLabel(month)}
              {i === 0 && <span className="ml-1 text-xs font-normal">(atual)</span>}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {table.sections.map((section) => {
          const sectionId = `section:${section.kind}`
          const sectionOpen = !collapsed.has(sectionId)
          return [
            <TableRow key={sectionId} className="bg-muted hover:bg-muted">
              <TableHead scope="row" className={cn(STICKY, 'bg-muted font-semibold')}>
                <ToggleLabel label={section.label} expanded={sectionOpen} onToggle={() => toggle(sectionId)} />
              </TableHead>
              <TotalCells values={section.totals} className="font-semibold" />
            </TableRow>,
            ...(!sectionOpen
              ? []
              : section.groups.flatMap((group) => {
                  const groupId = `group:${group.id}`
                  const groupOpen = !collapsed.has(groupId)
                  return [
                    <TableRow key={groupId}>
                      <TableHead scope="row" className={cn(STICKY, 'bg-background pl-6 font-medium')}>
                        <ToggleLabel label={group.name} expanded={groupOpen} onToggle={() => toggle(groupId)} />
                      </TableHead>
                      <TotalCells values={group.totals} className="font-medium" />
                    </TableRow>,
                    ...(!groupOpen
                      ? []
                      : group.categories.map((category) => {
                          const rowIndex = row++
                          return (
                            <TableRow key={`category:${category.id}`} className="hover:bg-transparent">
                              <TableHead
                                scope="row"
                                className={cn(STICKY, 'bg-background pl-14 font-normal text-muted-foreground')}
                              >
                                {category.name}
                              </TableHead>
                              {months.map((month, col) => (
                                <TableCell key={month} className={cn('p-0', col === 0 && 'bg-primary/5')}>
                                  <BudgetCell
                                    label={`${category.name} em ${formatMonthLong(month)}`}
                                    cents={category.values[col]}
                                    changed={isChanged(category.id, month)}
                                    row={rowIndex}
                                    col={col}
                                    canFillWindow={month < lastMonth}
                                    canFillYear={month < endOfYear(month)}
                                    onChange={(cents) => onChange(category.id, month, cents)}
                                    onFill={(scope) => onFill(category.id, month, scope)}
                                  />
                                </TableCell>
                              ))}
                            </TableRow>
                          )
                        })),
                  ]
                })),
          ]
        })}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableHead scope="row" className={cn(STICKY, 'bg-muted font-semibold')}>
            Saldo do mês
          </TableHead>
          {table.balances.map((cents, i) => (
            <TableCell key={i} className="px-3 text-right font-semibold">
              <MoneyText cents={cents} signed />
            </TableCell>
          ))}
        </TableRow>
        <TableRow>
          <TableHead scope="row" className={cn(STICKY, 'bg-muted font-semibold')}>
            Saldo acumulado
          </TableHead>
          {table.accumulated.map((cents, i) => (
            <TableCell key={i} className="px-3 text-right font-semibold">
              <MoneyText cents={cents} signed />
            </TableCell>
          ))}
        </TableRow>
      </TableFooter>
    </Table>
  )
}
