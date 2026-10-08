import { useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { FormAlert, Spinner } from '@/components/atoms'
import { AddressFields, FormField, PasswordField } from '@/components/molecules'
import { Button } from '@/components/ui/button'
import { cepNotFoundMessage, useCepAddress } from '@/features/address/hooks'
import { getActivationErrorMessage } from '@/features/auth/errors'
import { useCompleteSignup } from '@/features/auth/hooks'
import {
  latestBirthDate,
  validateNewPassword,
  validatePersonalData,
  type RegisterFieldErrors,
} from '@/features/auth/register-validation'
import type { ActivationInfo } from '@/features/auth/types'

interface CompleteSignupFormProps {
  token: string
  /** The pre-registration: its e-mail and the nickname given by whoever added them */
  info: ActivationInfo
}

/**
 * Sign-up of someone added to a group by e-mail: the link proves the e-mail,
 * so it only asks for the rest. Opens the groups afterwards.
 */
export function CompleteSignupForm({ token, info }: CompleteSignupFormProps) {
  const navigate = useNavigate()
  const passwordRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(info.name)
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const address = useCepAddress()
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({})
  const mutation = useCompleteSignup()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Keeps the password out of the URL even if JS handlers misbehave
    event.preventDefault()
    if (mutation.isPending || address.isFetching) return

    const values = {
      name: name.trim(),
      birthDate,
      cep: address.cepDigits,
      city: address.city.trim(),
      state: address.state,
    }
    const errors: RegisterFieldErrors = {
      ...validatePersonalData(values),
      ...validateNewPassword(password, passwordConfirmation),
    }
    if (address.cepNotFound) errors.cep = cepNotFoundMessage
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    mutation.mutate(
      { token, ...values, password },
      {
        onSuccess: () => navigate({ to: '/grupos', replace: true }),
        onError: () => {
          // Never keep a rejected password around
          setPassword('')
          setPasswordConfirmation('')
          passwordRef.current?.focus()
        },
      },
    )
  }

  return (
    <form method="post" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      {mutation.isError && <FormAlert>{getActivationErrorMessage(mutation.error)}</FormAlert>}
      <FormField label="E-mail" name="email" value={info.email} readOnly disabled />
      <FormField
        label="Nome"
        name="name"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={fieldErrors.name}
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
        {mutation.isPending && <Spinner aria-label="Ativando conta" />}
        Ativar minha conta
      </Button>
    </form>
  )
}
