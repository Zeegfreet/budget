import { useRef, useState } from 'react'
import { CheckCircle2Icon } from 'lucide-react'
import { FormAlert, Spinner } from '@/components/atoms'
import { PasswordField } from '@/components/molecules'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getPasswordChangeError, type PasswordChangeError } from '@/features/auth/errors'
import { useChangePassword } from '@/features/auth/hooks'
import {
  validatePasswordChange,
  type PasswordChangeErrors,
} from '@/features/auth/password-validation'

/**
 * Current password + new password twice. The fields are cleared after every
 * answer from the API, so no password lingers on screen.
 */
export function ChangePasswordForm() {
  const currentRef = useRef<HTMLInputElement>(null)
  const newRef = useRef<HTMLInputElement>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [fieldErrors, setFieldErrors] = useState<PasswordChangeErrors>({})
  const [apiError, setApiError] = useState<PasswordChangeError>({})

  function clear() {
    setCurrentPassword('')
    setNewPassword('')
    setPasswordConfirmation('')
  }

  const mutation = useChangePassword()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Keeps the passwords out of the URL even if JS handlers misbehave
    event.preventDefault()
    if (mutation.isPending) return

    const values = { currentPassword, newPassword, passwordConfirmation }
    const errors = validatePasswordChange(values)
    setFieldErrors(errors)
    setApiError({})
    mutation.reset()
    if (Object.keys(errors).length > 0) return

    mutation.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: clear,
        onError: (error) => {
          const next = getPasswordChangeError(error)
          setApiError(next)
          clear()
          if (next.newPassword) newRef.current?.focus()
          else currentRef.current?.focus()
        },
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova senha</CardTitle>
        <CardDescription>
          Ao alterar a senha, os outros aparelhos conectados à sua conta são desconectados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          {apiError.form && <FormAlert>{apiError.form}</FormAlert>}
          <PasswordField
            ref={currentRef}
            label="Senha atual"
            name="currentPassword"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            error={fieldErrors.currentPassword ?? apiError.currentPassword}
          />
          <PasswordField
            ref={newRef}
            label="Nova senha"
            name="newPassword"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={fieldErrors.newPassword ?? apiError.newPassword}
          />
          <PasswordField
            label="Repetir nova senha"
            name="passwordConfirmation"
            autoComplete="new-password"
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.target.value)}
            error={fieldErrors.passwordConfirmation}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Spinner aria-label="Salvando" />}
              Alterar senha
            </Button>
            {mutation.isSuccess && (
              <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2Icon className="size-4 text-success" aria-hidden />
                Senha alterada.
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
