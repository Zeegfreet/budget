import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { FormAlert, Spinner } from '@/components/atoms'
import { FormField, PasswordField } from '@/components/molecules'
import { Button } from '@/components/ui/button'
import { CepNotFoundError } from '@/features/address/api'
import { formatCep, normalizeCep } from '@/features/address/cep'
import { addressQueries } from '@/features/address/queries'
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

const cepNotFoundMessage = 'CEP não encontrado.'
const cepLookupFailedMessage = 'Não foi possível consultar o CEP. Preencha cidade e UF.'

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
  const [cep, setCep] = useState('')
  const [manualCity, setManualCity] = useState('')
  const [manualState, setManualState] = useState('')
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({})

  const cepDigits = normalizeCep(cep)
  const cepQuery = useQuery({
    ...addressQueries.byCep(cepDigits),
    enabled: cepDigits.length === 8,
  })
  const cepNotFound = cepQuery.error instanceof CepNotFoundError
  const lookupFailed = cepQuery.isError && !cepNotFound
  const city = cepQuery.data?.city ?? (lookupFailed ? manualCity : '')
  const state = cepQuery.data?.state ?? (lookupFailed ? manualState : '')

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
    if (mutation.isPending || cepQuery.isFetching) return

    const values = {
      name: name.trim(),
      email: email.trim(),
      password,
      passwordConfirmation,
      birthDate,
      cep: cepDigits,
      city: city.trim(),
      state,
    }
    const errors = validateRegister(values)
    if (cepNotFound) errors.cep = cepNotFoundMessage
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

  const addressReadOnly = !lookupFailed
  const cepDescription = cepQuery.isFetching
    ? 'Buscando endereço…'
    : lookupFailed
      ? cepLookupFailedMessage
      : undefined

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
      <FormField
        label="CEP"
        name="cep"
        inputMode="numeric"
        autoComplete="postal-code"
        placeholder="00000-000"
        value={cep}
        onChange={(e) => setCep(formatCep(e.target.value))}
        description={cepDescription}
        error={cepNotFound ? cepNotFoundMessage : fieldErrors.cep}
      />
      <div className="grid grid-cols-[1fr_5rem] items-start gap-3">
        <FormField
          label="Cidade"
          name="city"
          autoComplete="address-level2"
          readOnly={addressReadOnly}
          value={city}
          onChange={(e) => setManualCity(e.target.value)}
          error={fieldErrors.city}
        />
        <FormField
          label="UF"
          name="state"
          autoComplete="address-level1"
          autoCapitalize="characters"
          maxLength={2}
          readOnly={addressReadOnly}
          value={state}
          onChange={(e) => setManualState(e.target.value.toUpperCase())}
          error={fieldErrors.state}
        />
      </div>
      <Button type="submit" size="lg" className="h-10 w-full" disabled={mutation.isPending}>
        {mutation.isPending && <Spinner aria-label="Criando conta" />}
        Criar conta
      </Button>
    </form>
  )
}
