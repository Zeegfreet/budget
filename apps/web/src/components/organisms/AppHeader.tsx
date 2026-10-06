import { Link } from '@tanstack/react-router'
import { Logo } from '@/components/atoms'

export function AppHeader() {
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
        </nav>
      </div>
    </header>
  )
}
