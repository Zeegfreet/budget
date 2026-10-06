import { WalletIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Logo({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('inline-flex items-center gap-2 font-semibold', className)}
      {...props}
    >
      <WalletIcon className="size-5 text-primary" aria-hidden />
      Budget
    </span>
  )
}
