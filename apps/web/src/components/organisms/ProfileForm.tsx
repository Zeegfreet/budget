import { useState } from 'react'
import { CheckCircle2Icon } from 'lucide-react'
import { FormAlert, Spinner } from '@/components/atoms'
import { AddressFields, FormField } from '@/components/molecules'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cepNotFoundMessage, useCepAddress } from '@/features/address/hooks'
import {
  latestBirthDate,
  validatePersonalData,
  type PersonalDataErrors,
} from '@/features/auth/register-validation'
import { getProfileErrorMessage } from '@/features/profile/errors'
import { useUpdateProfile } from '@/features/profile/hooks'
import type { Profile, ProfilePatch } from '@/features/profile/types'

/**
 * Name, birth date and address of the signed-in user. The e-mail is shown but
 * can't change. Only the changed fields are sent; the address as a block.
 */
export function ProfileForm({ profile }: { profile: Profile }) {
  const [name, setName] = useState(profile.name)
  const [birthDate, setBirthDate] = useState(profile.birthDate)
  const address = useCepAddress(profile)
  const [fieldErrors, setFieldErrors] = useState<PersonalDataErrors>({})
  const mutation = useUpdateProfile()

  const values = {
    name: name.trim(),
    birthDate,
    cep: address.cepDigits,
    city: address.city.trim(),
    state: address.state,
  }
  const patch: ProfilePatch = {}
  if (values.name !== profile.name) patch.name = values.name
  if (values.birthDate !== profile.birthDate) patch.birthDate = values.birthDate
  if (values.cep !== profile.cep || values.city !== profile.city || values.state !== profile.state) {
    Object.assign(patch, { cep: values.cep, city: values.city, state: values.state })
  }
  const dirty = Object.keys(patch).length > 0

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dirty || mutation.isPending || address.isFetching) return

    const errors = validatePersonalData(values)
    if (address.cepNotFound) errors.cep = cepNotFoundMessage
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    mutation.mutate(patch)
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Dados pessoais</CardTitle>
        <CardDescription>Os mesmos dados informados no cadastro.</CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mutation.isError && <FormAlert>{getProfileErrorMessage(mutation.error)}</FormAlert>}
          <FormField
            label="E-mail"
            name="email"
            type="email"
            value={profile.email}
            disabled
            description="O e-mail não pode ser alterado."
          />
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
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!dirty || mutation.isPending}>
              {mutation.isPending && <Spinner aria-label="Salvando" />}
              Salvar alterações
            </Button>
            {mutation.isSuccess && !dirty && (
              <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2Icon className="size-4 text-success" aria-hidden />
                Perfil atualizado.
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
