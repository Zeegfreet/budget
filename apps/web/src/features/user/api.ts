import { api } from '@/lib/api/client'
import type { User } from './types'

export async function fetchUsers(): Promise<User[]> {
  const { data } = await api.get<User[]>('/user')
  return data
}
