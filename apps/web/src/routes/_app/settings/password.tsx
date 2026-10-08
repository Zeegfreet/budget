import { createFileRoute } from '@tanstack/react-router'
import { ChangePasswordForm } from '@/components/organisms'

export const Route = createFileRoute('/_app/settings/password')({
  component: PasswordPage,
})

function PasswordPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Alterar senha</h1>
      <ChangePasswordForm />
    </div>
  )
}
