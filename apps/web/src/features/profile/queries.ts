import { queryOptions } from '@tanstack/react-query'
import { fetchProfile } from './api'

export const profileQueries = {
  me: () => queryOptions({ queryKey: ['profile'], queryFn: fetchProfile }),
}
