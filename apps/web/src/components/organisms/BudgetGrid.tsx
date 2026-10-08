import {
  CheckIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { MoneyText } from '@/components/atoms'
import { BudgetCell, RowActions, type FillScope, type RowAction } from '@/components/molecules'
import { Button } from '@/components/ui/button'
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
import type { BudgetTable, CategoryRow, GroupRow, LineRow } from '@/features/budget/rows'
import type { EntryKind, Month } from '@/features/budget/types'
import { cn } from '@/lib/utils'

/** What the user asked to do with a type, category or launch row; the page handles it. */
export type GridAction =
  | { type: 'toggle-group'; group: GroupRow }
  | { type: 'toggle-category'; category: CategoryRow }
  | { type: 'edit-group' | 'delete-group' | 'create-category'; group: GroupRow }
  | { type: 'edit-category' | 'delete-category'; category: CategoryRow }
  | { type: 'create-line'; category: CategoryRow; kind: EntryKind }
  | { type: 'edit-line' | 'delete-line'; line: LineRow; kind: EntryKind }
  | { type: 'open-line'; line: LineRow; kind: EntryKind }

interface BudgetGridProps {
  table: BudgetTable
  /** Columns; the first one is the current month */
  months: Month[]
  /** Shows inactive types and categories (faded, read-only) */
  showInactive: boolean
  /** A launch row's month differs from the saved value */
  isChanged: (anchorId: number, month: Month) => boolean
  /** A launch row's month is realized: it shows the realized amount, read-only (edited in the statement) */
  isRealized: (anchorId: number, month: Month) => boolean
  onChange: (anchorId: number, month: Month, cents: number) => void
  onFill: (anchorId: number, month: Month, scope: FillScope) => void
  onAction: (action: GridAction) => void
}

const STICKY = 'sticky left-0 z-10'
const TOTAL = 'sticky right-0 z-10 border-l bg-muted px-3 text-right'

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
      className={cn('flex min-w-0 items-center gap-1 text-left outline-none focus-visible:underline', className)}
    >
      <ChevronRightIcon
        aria-hidden
        className={cn('size-4 shrink-0 transition-transform', expanded && 'rotate-90')}
      />
      <span className="truncate">{label}</span>
    </button>
  )
}

function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-1.5 py-px text-[0.7rem] font-normal whitespace-nowrap text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}

function TotalCells({ values, total, className }: { values: number[]; total: number; className?: string }) {
  return (
    <>
      {values.map((cents, i) => (
        <TableCell key={i} className={cn('px-3 text-right', i === 0 && 'bg-primary/5', className)}>
          <MoneyText cents={cents} />
        </TableCell>
      ))}
      <TableCell className={cn(TOTAL, 'font-semibold')}>
        <MoneyText cents={total} />
      </TableCell>
    </>
  )
}

const toggleAction = (active: boolean, onSelect: () => void): RowAction =>
  active
    ? { label: 'Inativar', icon: EyeOffIcon, onSelect }
    : { label: 'Reativar', icon: EyeIcon, onSelect }

interface AddRowProps {
  text: string
  /** Names the parent, e.g. "Nova categoria em Despesas Básicas" */
  ariaLabel: string
  indent: string
  months: number
  onClick: () => void
}

/** "+ Nova categoria" / "+ Novo lançamento" closing a type or a category */
function AddRow({ text, ariaLabel, indent, months, onClick }: AddRowProps) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className={cn(STICKY, 'bg-background py-1', indent)}>
        <Button variant="ghost" size="xs" aria-label={ariaLabel} className="text-muted-foreground" onClick={onClick}>
          <PlusIcon aria-hidden />
          {text}
        </Button>
      </TableCell>
      <TableCell colSpan={months} />
      <TableCell className={TOTAL} />
    </TableRow>
  )
}

/**
 * Pivot table of the budget: Despesas and Receitas (fixed), each expandable
 * into types, categories (collapsed by default) and their launches, one column
 * per month and a Total column. Values are typed on the launch rows (one per
 * recurring series or plain launch); categories show their sums, group shares
 * included. Every level has a menu (hover "⋯" or right click).
 */
export function BudgetGrid({
  table,
  months,
  showInactive,
  isChanged,
  isRealized,
  onChange,
  onFill,
  onAction,
}: BudgetGridProps) {
  // Sections and types start open, categories closed
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const flip = (set: typeof setCollapsed) => (id: string) =>
    set((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const toggle = flip(setCollapsed)
  const toggleCategory = flip(setExpanded)

  const lastMonth = months[months.length - 1]
  let row = 0

  const groupActions = (group: GroupRow): RowAction[] => [
    { label: 'Editar', icon: PencilIcon, onSelect: () => onAction({ type: 'edit-group', group }) },
    ...(group.active
      ? [{ label: 'Nova categoria', icon: PlusIcon, onSelect: () => onAction({ type: 'create-category', group }) }]
      : []),
    toggleAction(group.active, () => onAction({ type: 'toggle-group', group })),
    {
      label: 'Excluir',
      icon: Trash2Icon,
      destructive: true,
      separated: true,
      onSelect: () => onAction({ type: 'delete-group', group }),
    },
  ]

  const categoryActions = (category: CategoryRow, kind: EntryKind): RowAction[] => [
    ...(category.editable
      ? [
          {
            label: 'Novo lançamento',
            icon: PlusIcon,
            onSelect: () => onAction({ type: 'create-line', category, kind }),
          },
        ]
      : []),
    { label: 'Editar', icon: PencilIcon, onSelect: () => onAction({ type: 'edit-category', category }) },
    toggleAction(category.active, () => onAction({ type: 'toggle-category', category })),
    {
      label: 'Excluir',
      icon: Trash2Icon,
      destructive: true,
      separated: true,
      onSelect: () => onAction({ type: 'delete-category', category }),
    },
  ]

  const lineActions = (line: LineRow, kind: EntryKind, editable: boolean): RowAction[] => [
    ...(editable
      ? [{ label: 'Editar', icon: PencilIcon, onSelect: () => onAction({ type: 'edit-line', line, kind }) }]
      : []),
    { label: 'Ver no extrato', icon: ExternalLinkIcon, onSelect: () => onAction({ type: 'open-line', line, kind }) },
    {
      label: 'Excluir',
      icon: Trash2Icon,
      destructive: true,
      separated: true,
      onSelect: () => onAction({ type: 'delete-line', line, kind }),
    },
  ]

  const lineRow = (line: LineRow, category: CategoryRow, kind: EntryKind) => {
    const { anchorId } = line.line
    const rowIndex = category.editable ? row++ : -1
    return (
      <TableRow
        key={`line:${anchorId}`}
        data-inactive={!category.editable || undefined}
        className={cn('hover:bg-transparent', !category.editable && 'text-muted-foreground/70')}
      >
        <TableHead
          scope="row"
          aria-label={line.label}
          className={cn(STICKY, 'h-auto max-w-80 bg-background py-1 pl-20 font-normal text-muted-foreground')}
        >
          <RowActions label={line.label} actions={lineActions(line, kind, category.editable)}>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={cn('truncate', line.line.description === null && 'italic')}>{line.label}</span>
              {line.dueDay !== null && <Tag>Vence dia {line.dueDay}</Tag>}
            </div>
          </RowActions>
        </TableHead>
        {months.map((month, col) => {
          const realized = isRealized(anchorId, month)
          const editable = category.editable && !realized
          return (
            <TableCell
              key={month}
              className={cn(editable ? 'p-0' : 'px-3 text-right', col === 0 && 'bg-primary/5')}
            >
              {realized ? (
                <Link
                  to="/extrato"
                  search={{ month }}
                  aria-label={`${line.label} em ${formatMonthLong(month)}, realizado, ver no extrato`}
                  title="Realizado — altere no Extrato"
                  className="inline-flex items-center justify-end gap-1 underline decoration-dotted underline-offset-4 hover:text-primary"
                >
                  <CheckIcon aria-hidden className="size-3.5 text-success" />
                  <MoneyText cents={line.values[col]} />
                </Link>
              ) : editable ? (
                <BudgetCell
                  label={`${line.label} em ${formatMonthLong(month)}`}
                  cents={line.values[col]}
                  changed={isChanged(anchorId, month)}
                  row={rowIndex}
                  col={col}
                  canFillWindow={month < lastMonth}
                  canFillYear={month < endOfYear(month)}
                  onChange={(cents) => onChange(anchorId, month, cents)}
                  onFill={(scope) => onFill(anchorId, month, scope)}
                />
              ) : (
                <MoneyText cents={line.values[col]} />
              )}
            </TableCell>
          )
        })}
        <TableCell className={TOTAL}>
          <MoneyText cents={line.total} />
        </TableCell>
      </TableRow>
    )
  }

  const sharesRow = (category: CategoryRow, shares: number[]) => (
    <TableRow key={`shares:${category.id}`} className="hover:bg-transparent">
      <TableHead
        scope="row"
        aria-label={`Rateios de grupos em ${category.name}`}
        className={cn(STICKY, 'h-auto max-w-80 bg-background py-1 pl-20 font-normal text-muted-foreground')}
      >
        <span className="italic">Rateios de grupos</span>
      </TableHead>
      {months.map((month, col) => (
        <TableCell key={month} className={cn('px-3 text-right text-muted-foreground', col === 0 && 'bg-primary/5')}>
          {shares[col] === 0 ? (
            <MoneyText cents={0} />
          ) : (
            <Link
              to="/extrato"
              search={{ month }}
              aria-label={`Sua parte em grupos em ${formatMonthLong(month)}, ver no extrato`}
              title="Sua parte em grupos — veja no Extrato"
              className="underline decoration-dotted underline-offset-4 hover:text-primary"
            >
              <MoneyText cents={shares[col]} />
            </Link>
          )}
        </TableCell>
      ))}
      <TableCell className={cn(TOTAL, 'text-muted-foreground')}>
        <MoneyText cents={shares.reduce((a, b) => a + b, 0)} />
      </TableCell>
    </TableRow>
  )

  const categoryRows = (category: CategoryRow, kind: EntryKind) => {
    const categoryId = `category:${category.id}`
    const open = expanded.has(categoryId)
    return [
      <TableRow
        key={categoryId}
        data-inactive={!category.editable || undefined}
        className={cn(!category.editable && 'text-muted-foreground/70')}
      >
        <TableHead
          scope="row"
          aria-label={category.name}
          className={cn(STICKY, 'h-auto max-w-80 bg-background py-1 pl-12 font-normal text-muted-foreground')}
        >
          <RowActions label={category.name} actions={categoryActions(category, kind)}>
            <div className="flex min-w-0 items-center gap-1.5">
              <ToggleLabel label={category.name} expanded={open} onToggle={() => toggleCategory(categoryId)} />
              {category.lines.length > 0 && (
                <Tag>
                  {category.lines.length} {category.lines.length === 1 ? 'lançamento' : 'lançamentos'}
                </Tag>
              )}
              {!category.active && <Tag>Inativa</Tag>}
            </div>
          </RowActions>
        </TableHead>
        <TotalCells values={category.values} total={category.total} />
      </TableRow>,
      ...(open
        ? [
            ...category.lines.map((line) => lineRow(line, category, kind)),
            ...(category.shares ? [sharesRow(category, category.shares)] : []),
            ...(category.editable
              ? [
                  <AddRow
                    key={`add-line:${category.id}`}
                    text="Novo lançamento"
                    ariaLabel={`Novo lançamento em ${category.name}`}
                    indent="pl-19"
                    months={months.length}
                    onClick={() => onAction({ type: 'create-line', category, kind })}
                  />,
                ]
              : []),
          ]
        : []),
    ]
  }

  const groupRows = (group: GroupRow) => {
    const groupId = `group:${group.id}`
    const groupOpen = !collapsed.has(groupId)
    const categories = group.categories.filter((c) => showInactive || c.active)
    return [
      <TableRow
        key={groupId}
        data-inactive={!group.active || undefined}
        className={cn(!group.active && 'text-muted-foreground/70')}
      >
        <TableHead scope="row" aria-label={group.name} className={cn(STICKY, 'max-w-80 bg-background pl-6 font-medium')}>
          <RowActions label={group.name} actions={groupActions(group)}>
            <div className="flex min-w-0 items-center gap-1.5">
              <ToggleLabel label={group.name} expanded={groupOpen} onToggle={() => toggle(groupId)} />
              {group.goalPercent !== null && <Tag>Meta {group.goalPercent}%</Tag>}
              {!group.active && <Tag>Inativo</Tag>}
            </div>
          </RowActions>
        </TableHead>
        <TotalCells values={group.totals} total={group.total} className="font-medium" />
      </TableRow>,
      ...(!groupOpen ? [] : categories.flatMap((c) => categoryRows(c, group.kind))),
      ...(groupOpen && group.active
        ? [
            <AddRow
              key={`add:${group.id}`}
              text="Nova categoria"
              ariaLabel={`Nova categoria em ${group.name}`}
              indent="pl-11"
              months={months.length}
              onClick={() => onAction({ type: 'create-category', group })}
            />,
          ]
        : []),
    ]
  }

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
          <TableHead scope="col" className={cn(TOTAL, 'min-w-36 font-semibold')}>
            Total
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {table.sections.map((section) => {
          const sectionId = `section:${section.kind}`
          const sectionOpen = !collapsed.has(sectionId)
          const groups = section.groups.filter((g) => showInactive || g.active)
          return [
            <TableRow key={sectionId} className="bg-muted hover:bg-muted">
              <TableHead scope="row" className={cn(STICKY, 'bg-muted font-semibold')}>
                <ToggleLabel label={section.label} expanded={sectionOpen} onToggle={() => toggle(sectionId)} />
              </TableHead>
              <TotalCells values={section.totals} total={section.total} className="font-semibold" />
            </TableRow>,
            ...(sectionOpen ? groups.flatMap(groupRows) : []),
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
          <TableCell className={cn(TOTAL, 'font-semibold')}>
            <MoneyText cents={table.balanceTotal} signed />
          </TableCell>
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
          <TableCell className={cn(TOTAL, 'font-semibold')} title="Saldo ao fim do período">
            <MoneyText cents={table.accumulatedTotal} signed />
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}
