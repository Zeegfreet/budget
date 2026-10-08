import { api } from '@/lib/api/client'
import type { Profile, ProfilePatch } from './types'

export async function fetchProfile(): Promise<Profile> {
  const { data } = await api.get<Profile>('/users/me')
  return data
}

export async function updateProfile(patch: ProfilePatch): Promise<Profile> {
  const { data } = await api.patch<Profile>('/users/me', patch)
  return data
}
