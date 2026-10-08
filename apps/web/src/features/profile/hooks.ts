import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authQueries } from '@/features/auth/queries'
import type { AuthUser } from '@/features/auth/types'
import { budgetQueries } from '@/features/budget/queries'
import { groupQueries, invitationQueries } from '@/features/groups/queries'
import { updateProfile } from './api'
import { profileQueries } from './queries'
import type { ProfilePatch } from './types'

/**
 * Saves profile changes. The session user (side menu) takes the new name
 * right away; groups, invitations and the budget show member names, so they
 * are refreshed too.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (patch: ProfilePatch) => updateProfile(patch),
    onSuccess: async (profile) => {
      queryClient.setQueryData(profileQueries.me().queryKey, profile)
      queryClient.setQueryData<AuthUser>(authQueries.me().queryKey, {
        id: profile.id,
        email: profile.email,
        name: profile.name,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: groupQueries.all() }),
        queryClient.invalidateQueries({ queryKey: invitationQueries.received().queryKey }),
        queryClient.invalidateQueries({ queryKey: budgetQueries.all() }),
      ])
    },
  })
}
