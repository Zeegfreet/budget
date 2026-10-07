import { MoreHorizontalIcon } from 'lucide-react'
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
import { cn } from '@/lib/utils'

export interface RowAction {
  label: string
  icon: React.ComponentType
  onSelect: () => void
  destructive?: boolean
  /** Draws a separator before the item */
  separated?: boolean
}

interface RowActionsProps {
  /** Name of the row, for the button's accessible name ("Opções de Moradia") */
  label: string
  actions: RowAction[]
  children: React.ReactNode
  className?: string
}

/**
 * Wraps a row header: hovering shows a "⋯" button and a right click opens the
 * same actions (rename, inactivate, delete…).
 */
export function RowActions({ label, actions, children, className }: RowActionsProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn('group/row flex min-w-0 items-center gap-1', className)}>
          <div className="min-w-0 flex-1">{children}</div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                // Same as the cell menu: out of the Tab order, reachable by right
                // click or the context-menu key
                tabIndex={-1}
                aria-label={`Opções de ${label}`}
                className="shrink-0 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {actions.map(({ label: text, icon: Icon, onSelect, destructive, separated }) => [
                separated && <DropdownMenuSeparator key={`${text}-sep`} />,
                <DropdownMenuItem
                  key={text}
                  variant={destructive ? 'destructive' : 'default'}
                  onSelect={onSelect}
                >
                  <Icon aria-hidden />
                  {text}
                </DropdownMenuItem>,
              ])}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {actions.map(({ label: text, icon: Icon, onSelect, destructive, separated }) => [
          separated && <ContextMenuSeparator key={`${text}-sep`} />,
          <ContextMenuItem key={text} variant={destructive ? 'destructive' : 'default'} onSelect={onSelect}>
            <Icon aria-hidden />
            {text}
          </ContextMenuItem>,
        ])}
      </ContextMenuContent>
    </ContextMenu>
  )
}
