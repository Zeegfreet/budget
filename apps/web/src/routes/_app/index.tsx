import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { EmptyState } from '@/components/molecules'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { authQueries } from '@/features/auth/queries'

export const Route = createFileRoute('/_app/')({
  component: HomePage,
})

function HomePage() {
  // Already loaded by the _app guard, so this never shows a loading state
  const { data: user } = useQuery(authQueries.me())
  const firstName = user?.name.split(' ')[0]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {firstName ? `Olá, ${firstName}!` : 'Bem-vindo ao Budget'}
        </h1>
        <p className="text-muted-foreground">
          Gerencie suas finanças pessoais e compartilhadas.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Suas finanças</CardTitle>
          <CardDescription>Receitas e despesas aparecerão aqui.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState title="Nenhuma movimentação ainda" />
        </CardContent>
      </Card>
    </div>
  )
}
