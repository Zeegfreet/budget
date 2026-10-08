import { useState } from 'react'
import { FormAlert, Spinner } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import { activationSentMessage, getResendErrorMessage } from '@/features/auth/errors'
import { useResendActivation } from '@/features/auth/hooks'
import { EMAIL_PATTERN } from '@/features/auth/validation'
import { FormField } from './FormField'

interface ResendActivationProps {
  /** Known e-mail: just the button. Without it, an e-mail field comes first. */
  email?: string
  label?: string
}

/**
 * Asks the API for a new activation link. The answer never says whether the
 * e-mail has an account, so neither does the message.
 */
export function ResendActivation({ email, label = 'Reenviar e-mail de ativação' }: ResendActivationProps) {
  const mutation = useResendActivation()
  const [typed, setTyped] = useState('')
  const [fieldError, setFieldError] = useState<string>()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.isPending) return
    const target = (email ?? typed).trim()
    if (email === undefined) {
      const error = !target
        ? 'Informe seu e-mail.'
        : EMAIL_PATTERN.test(target)
          ? undefined
          : 'Informe um e-mail válido.'
      setFieldError(error)
      if (error) return
    }
    mutation.mutate(target)
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
      {email === undefined && (
        <FormField
          label="E-mail"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          error={fieldError}
        />
      )}
      <Button type="submit" variant="outline" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending && <Spinner aria-label="Enviando" />}
        {label}
      </Button>
      {mutation.isSuccess && (
        <p role="status" className="text-center text-sm text-muted-foreground">
          {activationSentMessage}
        </p>
      )}
      {mutation.isError && <FormAlert>{getResendErrorMessage(mutation.error)}</FormAlert>}
    </form>
  )
}
