import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { FormAlert, Spinner } from '@/components/atoms'
import { FormField, PasswordField } from '@/components/molecules'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import {
  getPasswordResetErrorMessage,
  invalidPasswordResetLinkMessage,
  isInvalidPasswordResetLink,
} from '@/features/auth/errors'
import { useResetPassword } from '@/features/auth/hooks'
import { passwordResetQueries } from '@/features/auth/queries'
import { validateNewPassword } from '@/features/auth/register-validation'
import type { PasswordResetInfo } from '@/features/auth/types'

/**
 * The page a password reset link opens: new password twice, then the user is
 * signed in. The link is only used on submit (mail scanners that open links
 * don't use it up); an invalid or expired one points to a new request.
 */
export function ResetPasswordCard({ token }: { token?: string }) {
  const query = useQuery({
    ...passwordResetQueries.byToken(token ?? ''),
    enabled: Boolean(token),
  })
  const [usedUp, setUsedUp] = useState(false)

  return (
    <Card className="gap-6 py-6 [--card-spacing:--spacing(6)]">
      {!token || query.isError || usedUp ? (
        <InvalidLink
          message={token && query.isError ? getPasswordResetErrorMessage(query.error) : invalidPasswordResetLinkMessage}
        />
      ) : query.data ? (
        <ResetForm token={token} info={query.data} onInvalidLink={() => setUsedUp(true)} />
      ) : (
        <CardContent className="flex justify-center py-6">
          <Spinner aria-label="Verificando link" />
        </CardContent>
      )}
    </Card>
  )
}

interface ResetFormProps {
  token: string
  info: PasswordResetInfo
  /** The link stopped working meanwhile (used, expired or replaced) */
  onInvalidLink: () => void
}

function ResetForm({ token, info, onInvalidLink }: ResetFormProps) {
  const navigate = useNavigate()
  const passwordRef = useRef<HTMLInputElement>(null)
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; passwordConfirmation?: string }>({})
  const mutation = useResetPassword()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Keeps the password out of the URL even if JS handlers misbehave
    event.preventDefault()
    if (mutation.isPending) return

    const errors = validateNewPassword(password, passwordConfirmation)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    mutation.mutate(
      { token, password },
      {
        onSuccess: () => navigate({ to: '/', replace: true }),
        onError: (error) => {
          // Never keep a rejected password around
          setPassword('')
          setPasswordConfirmation('')
          if (isInvalidPasswordResetLink(error)) onInvalidLink()
          else passwordRef.current?.focus()
        },
      },
    )
  }

  return (
    <>
      <CardHeader className="text-center">
        <h1 className="font-heading text-xl font-semibold">Criar nova senha</h1>
        <CardDescription>
          Olá, {info.name}! Escolha uma nova senha para entrar no Budget. Os aparelhos conectados à
          sua conta serão desconectados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form method="post" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mutation.isError && <FormAlert>{getPasswordResetErrorMessage(mutation.error)}</FormAlert>}
          <FormField
            label="E-mail"
            name="email"
            autoComplete="username"
            value={info.email}
            readOnly
            disabled
          />
          <PasswordField
            ref={passwordRef}
            label="Nova senha"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
          />
          <PasswordField
            label="Repetir nova senha"
            name="passwordConfirmation"
            autoComplete="new-password"
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.target.value)}
            error={fieldErrors.passwordConfirmation}
          />
          <Button type="submit" size="lg" className="h-10 w-full" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner aria-label="Salvando" />}
            Redefinir senha
          </Button>
        </form>
      </CardContent>
    </>
  )
}

function InvalidLink({ message }: { message: string }) {
  return (
    <>
      <CardHeader className="text-center">
        <h1 className="font-heading text-xl font-semibold">Redefinir senha</h1>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FormAlert>{message}</FormAlert>
        <Button asChild variant="outline" className="w-full">
          <Link to="/esqueci-senha">Pedir novo link</Link>
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Lembrou a senha?{' '}
          <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Entrar
          </Link>
        </p>
      </CardContent>
    </>
  )
}
