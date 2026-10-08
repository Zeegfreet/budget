import { ExternalLinkIcon } from 'lucide-react'
import { paymentUrlHost } from '@/lib/payment-url'
import { cn } from '@/lib/utils'

interface PaymentLinkButtonProps {
  /** The bill's or payment portal's address (http/https, checked by the API) */
  href: string
  /** What is paid there, for screen readers ("Conta de luz") */
  title: string
  className?: string
}

/**
 * Opens the bill (boleto) or payment portal of a launch in a new tab. The
 * link is finger-sized around the small icon.
 */
export function PaymentLinkButton({ href, title, className }: PaymentLinkButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Abrir link de pagamento: ${title}`}
      title={`Pagar em ${paymentUrlHost(href)}`}
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
    >
      <ExternalLinkIcon aria-hidden className="size-4" />
    </a>
  )
}
