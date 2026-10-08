import { Separator } from '@/components/ui/separator'
import { oauthProviders } from '@/features/auth/oauth'
import { OAuthButton } from './OAuthButton'

interface OAuthOptionsProps {
  /** Where to go after signing in */
  redirect?: string
}

/** "ou" divider followed by one button per OAuth provider. */
export function OAuthOptions({ redirect }: OAuthOptionsProps) {
  return (
    <>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" />
        ou
        <Separator className="flex-1" />
      </div>
      <div className="flex flex-col gap-3">
        {oauthProviders.map((provider) => (
          <OAuthButton key={provider.id} provider={provider} redirect={redirect} />
        ))}
      </div>
    </>
  )
}
