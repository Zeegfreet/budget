import { Logo } from '@/components/atoms'

/** Centered shell for sign-in / sign-up pages. */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-4 text-foreground">
      <Logo className="text-lg" />
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
