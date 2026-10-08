import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { FormAlert, Spinner } from '@/components/atoms'
import { ResendActivation } from '@/components/molecules'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { getActivationErrorMessage, invalidActivationLinkMessage } from '@/features/auth/errors'
import { useActivateAccount } from '@/features/auth/hooks'
import { activationQueries } from '@/features/auth/queries'
import type { ActivationInfo } from '@/features/auth/types'
import { CompleteSignupForm } from './CompleteSignupForm'

/**
 * The page an activation link opens. A sign-up is activated with one click
 * (never on load, so mail scanners that open links don't use it up); someone
 * added to a group finishes the sign-up first. An invalid or expired link
 * offers a new one.
 */
export function ActivationCard({ token }: { token?: string }) {
  const query = useQuery({
    ...activationQueries.byToken(token ?? ''),
    enabled: Boolean(token),
  })

  return (
    <Card className="gap-6 py-6 [--card-spacing:--spacing(6)]">
      {!token || query.isError ? (
        <InvalidLink message={token ? getActivationErrorMessage(query.error) : invalidActivationLinkMessage} />
      ) : query.data ? (
        query.data.kind === 'COMPLETE_SIGNUP' ? (
          <CompleteSignup token={token} info={query.data} />
        ) : (
          <Activate token={token} info={query.data} />
        )
      ) : (
        <CardContent className="flex justify-center py-6">
          <Spinner aria-label="Verificando link" />
        </CardContent>
      )}
    </Card>
  )
}

function Activate({ token, info }: { token: string; info: ActivationInfo }) {
  const navigate = useNavigate()
  const mutation = useActivateAccount()

  return (
    <>
      <CardHeader className="text-center">
        <h1 className="font-heading text-xl font-semibold">Ativar sua conta</h1>
        <CardDescription>
          Olá, {info.name}! Confirme a ativação da conta{' '}
          <strong className="font-medium break-all text-foreground">{info.email}</strong> para
          começar a usar o Budget.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mutation.isError && <FormAlert>{getActivationErrorMessage(mutation.error)}</FormAlert>}
        <Button
          size="lg"
          className="h-10 w-full"
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate(token, { onSuccess: () => navigate({ to: '/', replace: true }) })
          }
        >
          {mutation.isPending && <Spinner aria-label="Ativando conta" />}
          Ativar minha conta
        </Button>
      </CardContent>
    </>
  )
}

function CompleteSignup({ token, info }: { token: string; info: ActivationInfo }) {
  return (
    <>
      <CardHeader className="text-center">
        <h1 className="font-heading text-xl font-semibold">Ative sua conta</h1>
        <CardDescription>
          Você foi adicionado a um grupo no Budget. Crie sua senha e complete seu cadastro para
          acessá-lo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CompleteSignupForm token={token} info={info} />
      </CardContent>
    </>
  )
}

function InvalidLink({ message }: { message: string }) {
  return (
    <>
      <CardHeader className="text-center">
        <h1 className="font-heading text-xl font-semibold">Link de ativação</h1>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FormAlert>{message}</FormAlert>
        <ResendActivation label="Enviar novo link" />
        <p className="text-center text-sm text-muted-foreground">
          Já ativou?{' '}
          <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Entrar
          </Link>
        </p>
      </CardContent>
    </>
  )
}
