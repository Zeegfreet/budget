import { InboxIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  /** Optional call to action, e.g. a <Button> */
  action?: React.ReactNode
}

export function EmptyState({
  title,
  description,
  icon: Icon = InboxIcon,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center',
        className,
      )}
      {...props}
    >
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <h3 className="font-medium">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
