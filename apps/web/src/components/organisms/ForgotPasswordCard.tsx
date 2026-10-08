import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { FormAlert, Spinner } from '@/components/atoms'
import { FormField } from '@/components/molecules'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { getForgotPasswordErrorMessage, passwordResetSentMessage } from '@/features/auth/errors'
import { useRequestPasswordReset } from '@/features/auth/hooks'
import { EMAIL_PATTERN } from '@/features/auth/validation'

/**
 * "Esqueci minha senha": asks for the e-mail with a reset link. The answer
 * never says whether the e-mail has an account, so neither does the message.
 */
export function ForgotPasswordCard({ email: initialEmail = '' }: { email?: string }) {
  const mutation = useRequestPasswordReset()
  const [email, setEmail] = useState(initialEmail)
  const [fieldError, setFieldError] = useState<string>()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.isPending) return
    const target = email.trim()
    const error = !target
      ? 'Informe seu e-mail.'
      : EMAIL_PATTERN.test(target)
        ? undefined
        : 'Informe um e-mail válido.'
    setFieldError(error)
    if (error) return
    mutation.mutate(target)
  }

  return (
    <Card className="gap-6 py-6 [--card-spacing:--spacing(6)]">
      <CardHeader className="text-center">
        <h1 className="font-heading text-xl font-semibold">Esqueci minha senha</h1>
        <CardDescription>
          Informe o e-mail da sua conta e enviaremos um link para você criar uma nova senha.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form method="post" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mutation.isError && <FormAlert>{getForgotPasswordErrorMessage(mutation.error)}</FormAlert>}
          <FormField
            label="E-mail"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldError}
          />
          <Button type="submit" size="lg" className="h-10 w-full" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner aria-label="Enviando" />}
            Enviar link
          </Button>
          {mutation.isSuccess && (
            <p role="status" className="text-center text-sm text-muted-foreground">
              {passwordResetSentMessage} Confira também a caixa de spam.
            </p>
          )}
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Lembrou a senha?{' '}
          <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Voltar para o login
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
