import { TableIcon } from 'lucide-react'
import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { TrendPoint } from '@/features/budget/analytics'
import { formatMonthLabel, formatMonthLong } from '@/features/budget/months'
import { formatCents, formatCentsCompact } from '@/lib/money'
import { cn } from '@/lib/utils'

type Series = Exclude<keyof TrendPoint, 'month'>

/** Legend order = the fixed order of the categorical slots */
const SERIES: Series[] = ['incomeCents', 'expenseCents', 'balanceCents', 'accumulatedCents']

const config = {
  incomeCents: { label: 'Receitas', color: 'var(--chart-income)' },
  expenseCents: { label: 'Despesas', color: 'var(--chart-expense)' },
  balanceCents: { label: 'Saldo do mês', color: 'var(--chart-balance)' },
  accumulatedCents: { label: 'Saldo acumulado', color: 'var(--chart-accumulated)' },
} satisfies ChartConfig

interface MonthlyTrendChartProps {
  data: TrendPoint[]
}

/**
 * Income, expenses, the month's balance and the accumulated balance per month.
 * The same numbers are in a table (always there for screen readers, shown on
 * demand), since some line colors are light on the light theme.
 */
export function MonthlyTrendChart({ data }: MonthlyTrendChartProps) {
  const [showTable, setShowTable] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <ChartContainer config={config} className="aspect-auto h-72 w-full sm:h-80" aria-hidden>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={formatMonthLabel} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={72}
            tickFormatter={(value: number) => formatCentsCompact(value)}
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const month = payload?.[0]?.payload?.month as string | undefined
                  return month ? <span className="capitalize">{formatMonthLong(month)}</span> : null
                }}
                formatter={(value, name) => (
                  <div className="flex w-full items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: `var(--color-${name})` }}
                    />
                    <span className="text-muted-foreground">{config[name as Series].label}</span>
                    <span className="ml-auto font-medium tabular-nums">{formatCents(Number(value))}</span>
                  </div>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {SERIES.map((key) => (
            <Line
              key={key}
              dataKey={key}
              type="monotone"
              stroke={`var(--color-${key})`}
              strokeWidth={2}
              // The accumulated balance is dashed, so it isn't told apart by color alone
              strokeDasharray={key === 'accumulatedCents' ? '6 4' : undefined}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>

      <div>
        <Button variant="ghost" size="sm" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
          <TableIcon />
          {showTable ? 'Ocultar tabela' : 'Ver tabela'}
        </Button>
      </div>
      <div className={cn(showTable ? 'overflow-x-auto' : 'sr-only')}>
        <Table aria-label="Receitas, despesas e saldos por mês">
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              {SERIES.map((key) => (
                <TableHead key={key} className="text-right">
                  {config[key].label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((point) => (
              <TableRow key={point.month}>
                <TableHead scope="row" className="font-normal">
                  {formatMonthLabel(point.month)}
                </TableHead>
                {SERIES.map((key) => (
                  <TableCell key={key} className="text-right tabular-nums">
                    {formatCents(point[key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
