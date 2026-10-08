import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ProfileForm } from '@/components/organisms'
import { profileQueries } from '@/features/profile/queries'

export const Route = createFileRoute('/_app/settings/profile')({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(profileQueries.me()),
  component: ProfilePage,
})

function ProfilePage() {
  const { data: profile } = useSuspenseQuery(profileQueries.me())

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Editar perfil</h1>
      <ProfileForm profile={profile} />
    </div>
  )
}
