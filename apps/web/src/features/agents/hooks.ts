import { useMutation, useQueryClient } from '@tanstack/react-query'
import { decideAuthorizationRequest, revokeGrant } from './api'
import { agentQueries } from './queries'

/** Allows or denies the agent of a consent request (the caller follows the redirect). */
export function useDecideAuthorization(requestId: string) {
  return useMutation({
    mutationFn: (approve: boolean) => decideAuthorizationRequest(requestId, approve),
  })
}

/** Disconnects an agent: its tokens stop working at once. */
export function useRevokeGrant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: revokeGrant,
    onSettled: () => queryClient.invalidateQueries({ queryKey: agentQueries.grants().queryKey }),
  })
}
