import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { FormAlert, Spinner } from '@/components/atoms'
import { AddressFields, FormField } from '@/components/molecules'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { cepNotFoundMessage, useCepAddress } from '@/features/address/hooks'
import { useSignOut } from '@/features/auth/hooks'
import { safeRedirect } from '@/features/auth/redirect'
import {
  latestBirthDate,
  validatePersonalData,
  type PersonalDataErrors,
} from '@/features/auth/register-validation'
import type { AuthUser } from '@/features/auth/types'
import { getProfileErrorMessage } from '@/features/profile/errors'
import { useUpdateProfile } from '@/features/profile/hooks'
import type { ProfilePatch } from '@/features/profile/types'

interface CompleteProfileCardProps {
  /** Account created by GitHub/Google sign-in, still without birth date and address */
  user: AuthUser
  /** Where to go afterwards (sanitized) */
  redirect?: string
}

/**
 * Last sign-up step for GitHub/Google accounts: the data the provider doesn't
 * give (birth date and address), plus the chance to fix the provider's name.
 */
export function CompleteProfileCard({ user, redirect }: CompleteProfileCardProps) {
  const navigate = useNavigate()
  const [name, setName] = useState(user.name)
  const [birthDate, setBirthDate] = useState('')
  const address = useCepAddress()
  const [fieldErrors, setFieldErrors] = useState<PersonalDataErrors>({})
  const mutation = useUpdateProfile()
  const signOut = useSignOut()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.isPending || address.isFetching) return

    const values = {
      name: name.trim(),
      birthDate,
      cep: address.cepDigits,
      city: address.city.trim(),
      state: address.state,
    }
    const errors = validatePersonalData(values)
    if (address.cepNotFound) errors.cep = cepNotFoundMessage
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const patch: ProfilePatch = {
      birthDate: values.birthDate,
      cep: values.cep,
      city: values.city,
      state: values.state,
    }
    if (values.name !== user.name) patch.name = values.name
    mutation.mutate(patch, {
      onSuccess: () => navigate({ href: safeRedirect(redirect), replace: true }),
    })
  }

  return (
    <Card className="gap-6 py-6 [--card-spacing:--spacing(6)]">
      <CardHeader className="text-center">
        <h1 className="font-heading text-xl font-semibold">Complete seu cadastro</h1>
        <CardDescription>
          Falta pouco: informe sua data de nascimento e seu endereço para começar a usar o Budget.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form method="post" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mutation.isError && <FormAlert>{getProfileErrorMessage(mutation.error)}</FormAlert>}
          <FormField label="E-mail" name="email" value={user.email} readOnly disabled />
          <FormField
            label="Nome"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={fieldErrors.name}
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
            {mutation.isPending && <Spinner aria-label="Salvando" />}
            Concluir cadastro
          </Button>
        </form>
        <Button
          type="button"
          variant="link"
          className="self-center text-muted-foreground"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          Sair
        </Button>
      </CardContent>
    </Card>
  )
}
