import { Link } from '@tanstack/react-router'
import { MailCheckIcon } from 'lucide-react'
import { ResendActivation } from '@/components/molecules'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

/** After the sign-up: the account waits for the link sent to `email`. */
export function VerifyEmailCard({ email }: { email?: string }) {
  return (
    <Card className="gap-6 py-6 [--card-spacing:--spacing(6)]">
      <CardHeader className="items-center text-center">
        <MailCheckIcon aria-hidden className="mx-auto size-10 text-muted-foreground" />
        <h1 className="font-heading text-xl font-semibold">Confirme seu e-mail</h1>
        <CardDescription>
          {email ? (
            <>
              Enviamos um link de ativação para{' '}
              <strong className="font-medium break-all text-foreground">{email}</strong>.
            </>
          ) : (
            'Enviamos um link de ativação para o seu e-mail.'
          )}{' '}
          Abra o e-mail e clique no link para ativar sua conta.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <p className="text-center text-sm text-muted-foreground">
          Não recebeu? Confira a caixa de spam ou peça um novo link.
        </p>
        <ResendActivation email={email} />
        <p className="text-center text-sm text-muted-foreground">
          Já ativou?{' '}
          <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
