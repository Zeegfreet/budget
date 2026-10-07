import { createFileRoute } from '@tanstack/react-router'
import { KeyRoundIcon } from 'lucide-react'
import { EmptyState } from '@/components/molecules'

export const Route = createFileRoute('/_app/settings/password')({
  component: PasswordPage,
})

// Placeholder until the API supports it
function PasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Alterar senha</h1>
      <EmptyState
        icon={KeyRoundIcon}
        title="Em breve"
        description="A troca de senha ainda não está disponível."
      />
    </div>
  )
}
