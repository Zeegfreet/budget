import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChangePasswordForm } from '@/components/organisms'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { authQueries } from '@/features/auth/queries'

export const Route = createFileRoute('/_app/settings/password')({
  component: PasswordPage,
})

function PasswordPage() {
  const { user: sessionUser } = Route.useRouteContext()
  const { data: user = sessionUser } = useQuery(authQueries.me())

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Alterar senha</h1>
      {user.hasPassword ? (
        <ChangePasswordForm />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Sua conta não tem senha</CardTitle>
            <CardDescription>
              Você entra com o GitHub ou o Google, então não há senha para alterar aqui.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  )
}
