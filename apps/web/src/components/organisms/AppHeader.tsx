import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { LogOutIcon } from 'lucide-react'
import { Logo } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import { logout } from '@/features/auth/api'
import { authQueries } from '@/features/auth/queries'

export function AppHeader() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const me = useQuery(authQueries.me())

  const signOut = useMutation({
    mutationFn: logout,
    // Drop every cached (user-owned) query even if the API call fails
    onSettled: async () => {
      queryClient.clear()
      await navigate({ to: '/login', replace: true })
    },
  })

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link to="/" aria-label="Budget - início">
          <Logo />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            to="/"
            className="text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: 'text-foreground font-medium' }}
          >
            Início
          </Link>
          {me.data && (
            <span className="hidden text-muted-foreground sm:inline">{me.data.email}</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
          >
            <LogOutIcon aria-hidden />
            Sair
          </Button>
        </nav>
      </div>
    </header>
  )
}
