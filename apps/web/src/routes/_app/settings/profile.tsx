import { createFileRoute } from '@tanstack/react-router'
import { UserIcon } from 'lucide-react'
import { EmptyState } from '@/components/molecules'

export const Route = createFileRoute('/_app/settings/profile')({
  component: ProfilePage,
})

// Placeholder until the API supports it
function ProfilePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Editar perfil</h1>
      <EmptyState
        icon={UserIcon}
        title="Em breve"
        description="A edição do nome e dos dados de cadastro ainda não está disponível."
      />
    </div>
  )
}
