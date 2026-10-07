import { BrandIcon } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import { getOAuthLoginUrl } from '@/features/auth/oauth'
import type { OAuthProviderOption } from '@/features/auth/types'
import { cn } from '@/lib/utils'

type OAuthButtonProps = Omit<React.ComponentProps<'a'>, 'href'> & {
  provider: OAuthProviderOption
}

/** Full-width link that starts the OAuth flow for one provider. */
export function OAuthButton({ provider, className, ...props }: OAuthButtonProps) {
  return (
    <Button asChild variant="outline" size="lg" className={cn('h-10 w-full', className)}>
      <a
        href={getOAuthLoginUrl(provider.id)}
        title={provider.hint}
        {...props}
      >
        <BrandIcon provider={provider.id} />
        Continuar com {provider.label}{provider.hint && ' '}
        {provider.hint && <span className="sr-only">({provider.hint})</span>}
      </a>
    </Button>
  )
}
