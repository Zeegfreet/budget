import { MoneyText } from '@/components/atoms'
import { Card, CardAction, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps extends Omit<React.ComponentProps<typeof Card>, 'title'> {
  title: string
  /** Amount in integer cents */
  cents: number
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  /** Colors the amount green/red by its sign */
  signed?: boolean
  /** Optional control in the corner, e.g. an edit button (replaces the icon) */
  action?: React.ReactNode
}

/** One headline number, e.g. a balance on the dashboard. */
export function StatCard({
  title,
  cents,
  description,
  icon: Icon,
  signed = false,
  action,
  className,
  ...props
}: StatCardProps) {
  return (
    <Card role="region" aria-label={title} className={cn('gap-2', className)} {...props}>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        {(action || Icon) && (
          <CardAction>
            {action ?? (Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />)}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <MoneyText cents={cents} signed={signed} className="text-2xl font-semibold" />
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  )
}
