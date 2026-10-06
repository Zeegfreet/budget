import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Spinner } from '@/components/atoms'
import { EmptyState } from '@/components/molecules'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { userQueries } from '@/features/user/queries'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const users = useQuery(userQueries.all())

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Bem-vindo ao Budget</h1>
        <p className="text-muted-foreground">
          Gerencie suas finanças pessoais e compartilhadas.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuários</CardTitle>
          <CardDescription>Exemplo de dados vindos da API.</CardDescription>
        </CardHeader>
        <CardContent>
          {users.isPending ? (
            <Spinner />
          ) : users.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {users.error.message}
            </p>
          ) : users.data.length === 0 ? (
            <EmptyState title="Nenhum usuário cadastrado" />
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {users.data.map((user) => (
                <li key={user.id}>
                  {user.name ?? '—'}{' '}
                  <span className="text-muted-foreground">{user.email}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
