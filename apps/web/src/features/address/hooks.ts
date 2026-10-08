import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CepNotFoundError } from './api'
import { formatCep, normalizeCep } from './cep'
import { addressQueries } from './queries'
import type { Address } from './types'

export const cepNotFoundMessage = 'CEP não encontrado.'
export const cepLookupFailedMessage = 'Não foi possível consultar o CEP. Preencha cidade e UF.'

/**
 * CEP typed by the user, with city and UF looked up on ViaCEP. They only take
 * manual values when the lookup service is unavailable. While the CEP is the
 * one of `saved` (e.g. the profile), the saved city and UF are used as they
 * are, without a lookup.
 */
export function useCepAddress(saved?: Address) {
  const [cep, setCep] = useState(saved ? formatCep(saved.cep) : '')
  const [manualCity, setManualCity] = useState('')
  const [manualState, setManualState] = useState('')

  const cepDigits = normalizeCep(cep)
  const isSaved = !!saved && cepDigits === saved.cep
  const query = useQuery({
    ...addressQueries.byCep(cepDigits),
    enabled: cepDigits.length === 8 && !isSaved,
  })
  const cepNotFound = !isSaved && query.error instanceof CepNotFoundError
  const lookupFailed = !isSaved && query.isError && !cepNotFound
  const fallback = (manual: string) => (lookupFailed ? manual : '')

  return {
    /** Masked, as shown in the input */
    cep,
    cepDigits,
    city: isSaved ? saved.city : (query.data?.city ?? fallback(manualCity)),
    state: isSaved ? saved.state : (query.data?.state ?? fallback(manualState)),
    cepNotFound,
    lookupFailed,
    isFetching: !isSaved && query.isFetching,
    setCep: (value: string) => setCep(formatCep(value)),
    setCity: setManualCity,
    setState: (value: string) => setManualState(value.toUpperCase()),
  }
}

export type CepAddress = ReturnType<typeof useCepAddress>
