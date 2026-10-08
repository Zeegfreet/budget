import type { ComponentProps } from 'react'
import { DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const SIZES = {
  sm: 'sm:max-w-sm',
  /** Forms with several fields side by side (launches, rules, links) */
  md: 'sm:max-w-md',
} as const

/**
 * `DialogContent` for forms, keeping everything inside the box:
 * - the single grid track can't grow past the dialog, so long names, previews
 *   and select options wrap or truncate instead of widening it;
 * - taller than the screen, it scrolls, with the footer (actions) pinned to
 *   the bottom and opaque so the content passes under it.
 */
export function FormDialogContent({
  size = 'sm',
  className,
  ...props
}: ComponentProps<typeof DialogContent> & { size?: keyof typeof SIZES }) {
  return (
    <DialogContent
      data-size={size}
      className={cn(
        'max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto [overflow-wrap:anywhere]',
        '[&_[data-slot=native-select-wrapper]]:max-w-full [&_fieldset]:min-w-0',
        '[&_[data-slot=dialog-footer]]:sm:flex-wrap [&_[data-slot=dialog-footer]]:sticky [&_[data-slot=dialog-footer]]:-bottom-4 [&_[data-slot=dialog-footer]]:z-10 [&_[data-slot=dialog-footer]]:bg-[color-mix(in_oklab,var(--muted)_50%,var(--popover))]',
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
