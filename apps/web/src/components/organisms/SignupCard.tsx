import { Link } from '@tanstack/react-router'
import { OAuthOptions } from '@/components/molecules'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from '@/components/ui/card'
import { SignupForm } from './SignupForm'

interface SignupCardProps {
  /** Where to go after signing up */
  redirect?: string
}

export function SignupCard({ redirect }: SignupCardProps) {
  return (
    <Card className="gap-6 py-6 [--card-spacing:--spacing(6)]">
      <CardHeader className="text-center">
        <h1 className="font-heading text-xl font-semibold">Criar conta no Budget</h1>
        <CardDescription>Preencha seus dados ou continue com uma conta abaixo.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <SignupForm redirect={redirect} />
        <OAuthOptions />
        <p className="text-center text-sm text-muted-foreground">
          Já tem conta?{' '}
          <Link
            to="/login"
            search={redirect ? { redirect } : {}}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Entrar
          </Link>
        </p>
      </CardContent>
      <CardFooter className="justify-center border-t-0 bg-transparent pt-0 text-center text-xs text-muted-foreground">
        Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade.
      </CardFooter>
    </Card>
  )
}
