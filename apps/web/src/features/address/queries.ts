import { queryOptions } from '@tanstack/react-query'
import { lookupCep } from './api'

export const addressQueries = {
  /** Address for an 8-digit CEP. CEPs don't move, so results never go stale. */
  byCep: (cep: string) =>
    queryOptions({
      queryKey: ['address', 'cep', cep],
      queryFn: () => lookupCep(cep),
      staleTime: Infinity,
      retry: false,
    }),
}
