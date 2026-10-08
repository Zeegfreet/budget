import { Link } from '@tanstack/react-router'
import { FormAlert } from '@/components/atoms'
import { OAuthOptions } from '@/components/molecules'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from '@/components/ui/card'
import { LoginForm } from './LoginForm'

interface LoginCardProps {
  /** Message from a failed OAuth callback */
  error?: string
  /** Where to go after signing in */
  redirect?: string
}

export function LoginCard({ error, redirect }: LoginCardProps) {
  return (
    <Card className="gap-6 py-6 [--card-spacing:--spacing(6)]">
      <CardHeader className="text-center">
        <h1 className="font-heading text-xl font-semibold">Entrar no Budget</h1>
        <CardDescription>Acesse com seu e-mail ou uma conta abaixo.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {error && <FormAlert>{error}</FormAlert>}
        <LoginForm redirect={redirect} />
        <OAuthOptions redirect={redirect} />
        <p className="text-center text-sm text-muted-foreground">
          Não tem conta?{' '}
          <Link
            to="/signup"
            search={redirect ? { redirect } : {}}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Criar conta
          </Link>
        </p>
      </CardContent>
      <CardFooter className="justify-center border-t-0 bg-transparent pt-0 text-center text-xs text-muted-foreground">
        Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade.
      </CardFooter>
    </Card>
  )
}
