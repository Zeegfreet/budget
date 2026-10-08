import { BrandIcon } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import { getOAuthLoginUrl } from '@/features/auth/oauth'
import type { OAuthProviderOption } from '@/features/auth/types'
import { cn } from '@/lib/utils'

type OAuthButtonProps = Omit<React.ComponentProps<'a'>, 'href'> & {
  provider: OAuthProviderOption
  /** Where to go after signing in */
  redirect?: string
}

/** Full-width link that starts the OAuth flow for one provider. */
export function OAuthButton({ provider, redirect, className, ...props }: OAuthButtonProps) {
  return (
    <Button asChild variant="outline" size="lg" className={cn('h-10 w-full', className)}>
      <a
        href={getOAuthLoginUrl(provider.id, { redirect })}
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
