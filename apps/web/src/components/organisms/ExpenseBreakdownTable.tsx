import { EmptyState } from '@/components/molecules'
import { MoneyText } from '@/components/atoms'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ExpenseBreakdown } from '@/features/budget/analytics'
import { formatPercent } from '@/features/groups/split'
import { formatCents } from '@/lib/money'

interface ExpenseBreakdownTableProps {
  breakdown: ExpenseBreakdown
  /** e.g. "out/26" */
  monthLabel: string
  /** e.g. "out/26 a set/27" */
  periodLabel: string
}

/**
 * Expenses per category: a bar for the first month and one for the whole
 * period with its share of the period's expenses. Each column's bars are
 * relative to that column's largest value.
 */
export function ExpenseBreakdownTable({ breakdown, monthLabel, periodLabel }: ExpenseBreakdownTableProps) {
  const { rows, monthTotalCents, periodTotalCents } = breakdown
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nenhuma despesa no período"
        description="As despesas planejadas ou realizadas aparecem aqui por categoria."
      />
    )
  }
  const monthMax = Math.max(...rows.map((r) => r.monthCents))
  const periodMax = Math.max(...rows.map((r) => r.periodCents))

  return (
    <div className="overflow-x-auto">
      <Table aria-label="Despesas por categoria" className="min-w-xl">
        <TableHeader>
          <TableRow>
            <TableHead>Categoria</TableHead>
            <TableHead className="w-[35%]">{monthLabel}</TableHead>
            <TableHead className="w-[35%]">{periodLabel}</TableHead>
            <TableHead className="text-right">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.categoryId}>
              <TableHead scope="row" className="h-auto py-2 font-normal">
                <span className="block font-medium text-foreground">{row.name}</span>
                <span className="block text-xs text-muted-foreground">{row.groupName}</span>
              </TableHead>
              <TableCell>
                <Bar cents={row.monthCents} max={monthMax} label={`${row.name} em ${monthLabel}`} />
              </TableCell>
              <TableCell>
                <Bar cents={row.periodCents} max={periodMax} label={`${row.name} de ${periodLabel}`} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatPercent(row.shareBasisPoints)}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableHead scope="row">Total</TableHead>
            <TableCell className="text-right">
              <MoneyText cents={monthTotalCents} />
            </TableCell>
            <TableCell className="text-right">
              <MoneyText cents={periodTotalCents} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{periodTotalCents > 0 ? '100%' : '0%'}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}

/** A value with a bar as long as its share of the column's largest value */
function Bar({ cents, max, label }: { cents: number; max: number; label: string }) {
  const width = max > 0 ? Math.round((cents * 100) / max) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${label}: ${formatCents(cents)}`}>
        <div className="h-full rounded-full bg-(--chart-expense)" style={{ width: `${width}%` }} />
      </div>
      <span className="w-28 shrink-0 text-right text-sm tabular-nums">{formatCents(cents)}</span>
    </div>
  )
}
