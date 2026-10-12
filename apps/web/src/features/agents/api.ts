import { api } from '@/lib/api/client'
import type { AgentGrant, AuthorizationRequest, McpInfo } from './types'

export async function fetchAuthorizationRequest(id: string): Promise<AuthorizationRequest> {
  const { data } = await api.get<AuthorizationRequest>(`/oauth/requests/${encodeURIComponent(id)}`)
  return data
}

/** Allows or denies the agent; returns where the browser goes next (the agent). */
export async function decideAuthorizationRequest(id: string, approve: boolean): Promise<string> {
  const { data } = await api.post<{ redirectUrl: string }>(
    `/oauth/requests/${encodeURIComponent(id)}`,
    { approve },
  )
  return data.redirectUrl
}

export async function fetchGrants(): Promise<AgentGrant[]> {
  const { data } = await api.get<AgentGrant[]>('/oauth/grants')
  return data
}

export async function revokeGrant(id: number): Promise<void> {
  await api.delete(`/oauth/grants/${id}`)
}

export async function fetchMcpInfo(): Promise<McpInfo> {
  const { data } = await api.get<McpInfo>('/oauth/info')
  return data
}
