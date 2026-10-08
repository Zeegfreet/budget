import { CalendarRangeIcon, CopyIcon, EraserIcon, MoreVerticalIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { MoneyInput } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatAmount, parseMoneyInput } from '@/lib/money'
import { cn } from '@/lib/utils'

export type FillScope = 'window' | 'year'

interface BudgetCellProps {
  /** Accessible name, e.g. "Moradia em outubro de 2026" */
  label: string
  cents: number
  /** Differs from the saved value */
  changed: boolean
  /** Position among editable cells, for Enter / Shift+Enter navigation */
  row: number
  col: number
  canFillWindow: boolean
  canFillYear: boolean
  onChange: (cents: number) => void
  onFill: (scope: FillScope) => void
}

const focusCell = (row: number, col: number) =>
  document.querySelector<HTMLInputElement>(`[data-cell="${row}:${col}"]`)?.focus()

/**
 * Editable amount of the budget grid. Typing edits a local text; leaving the
 * cell (Tab, Enter, click away) commits it and Esc reverts it. Invalid text is
 * dropped. The "⋯" button or a right click opens the cell's actions.
 */
export function BudgetCell({
  label,
  cents,
  changed,
  row,
  col,
  canFillWindow,
  canFillYear,
  onChange,
  onFill,
}: BudgetCellProps) {
  // null while not editing: the input then shows the formatted value
  const [text, setText] = useState<string | null>(null)
  const cancelled = useRef(false)
  const display = cents === 0 ? '' : formatAmount(cents)

  function commit() {
    if (text === null) return
    const trimmed = text.trim()
    const next = trimmed === '' ? 0 : parseMoneyInput(trimmed)
    if (next !== null && next !== cents) onChange(next)
  }

  const actions = [
    {
      label: 'Replicar para os meses seguintes',
      icon: CopyIcon,
      disabled: !canFillWindow,
      onSelect: () => onFill('window'),
    },
    ...(canFillYear
      ? [{ label: 'Replicar até dezembro', icon: CalendarRangeIcon, disabled: false, onSelect: () => onFill('year') }]
      : []),
    { label: 'Limpar valor', icon: EraserIcon, disabled: cents === 0, onSelect: () => onChange(0), separated: true },
  ]

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-changed={changed || undefined}
          className={cn(
            'group/cell relative flex items-center',
            changed && 'bg-amber-100/70 dark:bg-amber-400/15',
          )}
        >
          <MoneyInput
            aria-label={label}
            data-cell={`${row}:${col}`}
            placeholder="0,00"
            value={text ?? display}
            onValueChange={setText}
            onFocus={(e) => {
              setText(display)
              e.currentTarget.select()
            }}
            onBlur={() => {
              if (cancelled.current) cancelled.current = false
              else commit()
              setText(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                cancelled.current = true
                e.currentTarget.blur()
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const target = e.shiftKey ? row - 1 : row + 1
                if (!focusCell(target, col)) e.currentTarget.blur()
              }
            }}
            className="h-9 rounded-none border-transparent bg-transparent pr-7 shadow-none focus-visible:ring-2 focus-visible:ring-inset dark:bg-transparent"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                // Kept out of the Tab order so Tab moves between cells; right click
                // or the context-menu key reach the same actions from the keyboard
                tabIndex={-1}
                aria-label={`Ações de ${label}`}
                className="absolute right-0.5 opacity-0 group-hover/cell:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.map(({ label: text, icon: Icon, disabled, onSelect, separated }) => [
                separated && <DropdownMenuSeparator key={`${text}-sep`} />,
                <DropdownMenuItem key={text} disabled={disabled} onSelect={onSelect}>
                  <Icon aria-hidden />
                  {text}
                </DropdownMenuItem>,
              ])}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {actions.map(({ label: text, icon: Icon, disabled, onSelect, separated }) => [
          separated && <ContextMenuSeparator key={`${text}-sep`} />,
          <ContextMenuItem key={text} disabled={disabled} onSelect={onSelect}>
            <Icon aria-hidden />
            {text}
          </ContextMenuItem>,
        ])}
      </ContextMenuContent>
    </ContextMenu>
  )
}
