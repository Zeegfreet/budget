import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { changePassword, logout } from './api'
import { authQueries } from './queries'

/** Ends the session and goes back to /login. */
export function useSignOut() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: logout,
    // Drop every cached (user-owned) query even if the API call fails
    onSettled: async () => {
      queryClient.clear()
      await navigate({ to: '/login', replace: true })
    },
  })
}

/** Changes the signed-in user's password; this session stays open with new cookies. */
export function useChangePassword() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: changePassword,
    onSuccess: (user) => queryClient.setQueryData(authQueries.me().queryKey, user),
  })
}
