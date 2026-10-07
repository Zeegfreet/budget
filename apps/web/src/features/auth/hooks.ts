import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { logout } from './api'

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
