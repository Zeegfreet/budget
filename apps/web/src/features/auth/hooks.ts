import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  activate,
  changePassword,
  completeSignup,
  logout,
  requestPasswordReset,
  resendActivation,
  resetPassword,
} from './api'
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

/** Activates an account through its e-mail link; the new session becomes the current user. */
export function useActivateAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: activate,
    onSuccess: (user) => queryClient.setQueryData(authQueries.me().queryKey, user),
  })
}

/** Finishes a pre-registration through its e-mail link; the new session becomes the current user. */
export function useCompleteSignup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: completeSignup,
    onSuccess: (user) => queryClient.setQueryData(authQueries.me().queryKey, user),
  })
}

/** Asks for the activation e-mail again. */
export function useResendActivation() {
  return useMutation({ mutationFn: resendActivation })
}

/** Asks for the e-mail with a link to set a new password. */
export function useRequestPasswordReset() {
  return useMutation({ mutationFn: requestPasswordReset })
}

/** Sets a new password through its e-mail link; the new session becomes the current user. */
export function useResetPassword() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: resetPassword,
    onSuccess: (user) => queryClient.setQueryData(authQueries.me().queryKey, user),
  })
}
