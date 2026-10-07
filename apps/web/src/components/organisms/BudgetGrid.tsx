import {
  ChevronRightIcon,
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
import type { BudgetTable, CategoryRow, GroupRow } from '@/features/budget/rows'
import type { Month } from '@/features/budget/types'
import { cn } from '@/lib/utils'

/** What the user asked to do with a type or category; the page handles it. */
export type GridAction =
  | { type: 'toggle-group'; group: GroupRow }
  | { type: 'toggle-category'; category: CategoryRow }
  | { type: 'edit-group' | 'delete-group' | 'create-category'; group: GroupRow }
  | { type: 'edit-category' | 'delete-category'; category: CategoryRow }

interface BudgetGridProps {
  table: BudgetTable
  /** Columns; the first one is the current month */
  months: Month[]
  /** Shows inactive types and categories (faded, read-only) */
  showInactive: boolean
  isChanged: (categoryId: number, month: Month) => boolean
  /** The cell holds several transactions: shown read-only, linking to the statement */
  isLocked: (categoryId: number, month: Month) => boolean
  /** The cell includes the user's share of a linked group (locked as well) */
  hasGroupShare?: (categoryId: number, month: Month) => boolean
  onChange: (categoryId: number, month: Month, cents: number) => void
  onFill: (categoryId: number, month: Month, scope: FillScope) => void
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

/**
 * Pivot table of the budget: Despesas and Receitas (fixed), each expandable
 * into types and then categories, one editable column per month and a Total
 * column. Types and categories have a menu (hover "⋯" or right click) to edit,
 * inactivate or delete them; "+ Nova categoria" closes each type.
 */
export function BudgetGrid({
  table,
  months,
  showInactive,
  isChanged,
  isLocked,
  hasGroupShare = () => false,
  onChange,
  onFill,
  onAction,
}: BudgetGridProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

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

  const categoryActions = (category: CategoryRow): RowAction[] => [
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

  const categoryRow = (category: CategoryRow) => {
    const rowIndex = category.editable ? row++ : -1
    return (
      <TableRow
        key={`category:${category.id}`}
        data-inactive={!category.editable || undefined}
        className={cn('hover:bg-transparent', !category.editable && 'text-muted-foreground/70')}
      >
        <TableHead
          scope="row"
          aria-label={category.name}
          className={cn(STICKY, 'h-auto max-w-80 bg-background py-1 pl-14 font-normal text-muted-foreground')}
        >
          <RowActions label={category.name} actions={categoryActions(category)}>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{category.name}</span>
              {category.dueDay !== null && <Tag>Vence dia {category.dueDay}</Tag>}
              {!category.active && <Tag>Inativa</Tag>}
            </div>
            {category.description && (
              <p className="truncate text-xs text-muted-foreground/80" title={category.description}>
                {category.description}
              </p>
            )}
          </RowActions>
        </TableHead>
        {months.map((month, col) => (
          <TableCell
            key={month}
            className={cn(
              category.editable && !isLocked(category.id, month) ? 'p-0' : 'px-3 text-right',
              col === 0 && 'bg-primary/5',
            )}
          >
            {category.editable && isLocked(category.id, month) ? (
              <Link
                to="/extrato"
                search={{ month }}
                aria-label={
                  hasGroupShare(category.id, month)
                    ? `${category.name} em ${formatMonthLong(month)}: inclui sua parte em grupos, ver no extrato`
                    : `${category.name} em ${formatMonthLong(month)}: vários lançamentos, editar no extrato`
                }
                title={
                  hasGroupShare(category.id, month)
                    ? 'Inclui sua parte em grupos — veja no Extrato'
                    : 'Vários lançamentos — edite no Extrato'
                }
                className="underline decoration-dotted underline-offset-4 hover:text-primary"
              >
                <MoneyText cents={category.values[col]} />
              </Link>
            ) : category.editable ? (
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
            ) : (
              <MoneyText cents={category.values[col]} />
            )}
          </TableCell>
        ))}
        <TableCell className={TOTAL}>
          <MoneyText cents={category.total} />
        </TableCell>
      </TableRow>
    )
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
      ...(!groupOpen ? [] : categories.map(categoryRow)),
      ...(groupOpen && group.active
        ? [
            <TableRow key={`add:${group.id}`} className="hover:bg-transparent">
              <TableCell className={cn(STICKY, 'bg-background py-1 pl-13')}>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={`Nova categoria em ${group.name}`}
                  className="text-muted-foreground"
                  onClick={() => onAction({ type: 'create-category', group })}
                >
                  <PlusIcon aria-hidden />
                  Nova categoria
                </Button>
              </TableCell>
              <TableCell colSpan={months.length} />
              <TableCell className={TOTAL} />
            </TableRow>,
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
