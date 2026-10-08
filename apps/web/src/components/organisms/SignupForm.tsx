import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { FormAlert, Spinner } from '@/components/atoms'
import { AddressFields, FormField, PasswordField } from '@/components/molecules'
import { Button } from '@/components/ui/button'
import { cepNotFoundMessage, useCepAddress } from '@/features/address/hooks'
import { register } from '@/features/auth/api'
import { getRegisterErrorMessage } from '@/features/auth/errors'
import { authQueries } from '@/features/auth/queries'
import { safeRedirect } from '@/features/auth/redirect'
import {
  latestBirthDate,
  validateRegister,
  type RegisterFieldErrors,
} from '@/features/auth/register-validation'
import { ApiError } from '@/lib/api/client'

/**
 * Sign-up form. City and UF come from the CEP (ViaCEP); they only become
 * editable when the lookup service is unavailable. `redirect` is where to go
 * afterwards (sanitized).
 */
export function SignupForm({ redirect }: { redirect?: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const passwordRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const address = useCepAddress()
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({})
  const { cepDigits, state } = address

  const mutation = useMutation({
    mutationFn: register,
    onSuccess: async (user) => {
      queryClient.setQueryData(authQueries.me().queryKey, user)
      await navigate({ href: safeRedirect(redirect), replace: true })
    },
    onError: () => {
      // Never keep a rejected password around
      setPassword('')
      setPasswordConfirmation('')
      passwordRef.current?.focus()
    },
  })

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Keeps the password out of the URL even if JS handlers misbehave
    event.preventDefault()
    if (mutation.isPending || address.isFetching) return

    const values = {
      name: name.trim(),
      email: email.trim(),
      password,
      passwordConfirmation,
      birthDate,
      cep: cepDigits,
      city: address.city.trim(),
      state,
    }
    const errors = validateRegister(values)
    if (address.cepNotFound) errors.cep = cepNotFoundMessage
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    mutation.mutate({
      name: values.name,
      email: values.email,
      password,
      birthDate,
      cep: cepDigits,
      city: values.city,
      state,
    })
  }

  return (
    <form method="post" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      {mutation.isError && (
        <FormAlert>
          {getRegisterErrorMessage(mutation.error)}
          {mutation.error instanceof ApiError && mutation.error.status === 409 && (
            <>
              {' '}
              <Link
                to="/login"
                search={redirect ? { redirect } : {}}
                className="font-medium underline underline-offset-4"
              >
                Entrar
              </Link>
            </>
          )}
        </FormAlert>
      )}
      <FormField
        label="Nome"
        name="name"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={fieldErrors.name}
      />
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
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
      />
      <PasswordField
        label="Confirmar senha"
        name="passwordConfirmation"
        autoComplete="new-password"
        value={passwordConfirmation}
        onChange={(e) => setPasswordConfirmation(e.target.value)}
        error={fieldErrors.passwordConfirmation}
      />
      <FormField
        label="Data de nascimento"
        name="birthDate"
        type="date"
        autoComplete="bday"
        max={latestBirthDate(new Date())}
        value={birthDate}
        onChange={(e) => setBirthDate(e.target.value)}
        error={fieldErrors.birthDate}
      />
      <AddressFields address={address} errors={fieldErrors} />
      <Button type="submit" size="lg" className="h-10 w-full" disabled={mutation.isPending}>
        {mutation.isPending && <Spinner aria-label="Criando conta" />}
        Criar conta
      </Button>
    </form>
  )
}
