import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { FormAlert, Spinner } from '@/components/atoms'
import { FormField, PasswordField } from '@/components/molecules'
import { Button } from '@/components/ui/button'
import { login } from '@/features/auth/api'
import { getCredentialsErrorMessage } from '@/features/auth/errors'
import { authQueries } from '@/features/auth/queries'
import { safeRedirect } from '@/features/auth/redirect'
import { EMAIL_PATTERN } from '@/features/auth/validation'

interface FieldErrors {
  email?: string
  password?: string
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {}
  if (!email) errors.email = 'Informe seu e-mail.'
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Informe um e-mail válido.'
  if (!password) errors.password = 'Informe sua senha.'
  return errors
}

/** E-mail + password sign-in. `redirect` is where to go afterwards (sanitized). */
export function LoginForm({ redirect }: { redirect?: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const passwordRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: async (user) => {
      queryClient.setQueryData(authQueries.me().queryKey, user)
      await navigate({ href: safeRedirect(redirect), replace: true })
    },
    onError: () => {
      // Never keep a rejected password around
      setPassword('')
      passwordRef.current?.focus()
    },
  })

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Keeps credentials out of the URL even if JS handlers misbehave
    event.preventDefault()
    if (mutation.isPending) return

    const trimmedEmail = email.trim()
    const errors = validate(trimmedEmail, password)
    setFieldErrors(errors)
    if (errors.email || errors.password) return

    mutation.mutate({ email: trimmedEmail, password })
  }

  return (
    <form method="post" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      {mutation.isError && (
        <FormAlert>{getCredentialsErrorMessage(mutation.error)}</FormAlert>
      )}
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
        error={fieldErrors.email}
      />
      <PasswordField
        ref={passwordRef}
        label="Senha"
        name="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
      />
      <Button type="submit" size="lg" className="h-10 w-full" disabled={mutation.isPending}>
        {mutation.isPending && <Spinner aria-label="Entrando" />}
        Entrar
      </Button>
    </form>
  )
}
