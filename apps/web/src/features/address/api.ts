import axios from 'axios'
import type { Address } from './types'

/** The CEP is well formed but doesn't exist. */
export class CepNotFoundError extends Error {
  constructor(cep: string) {
    super(`CEP ${cep} not found`)
    this.name = 'CepNotFoundError'
  }
}

/** Subset of the ViaCEP payload we use. Unknown CEPs come back as `{ erro: true }`. */
export interface ViaCepResponse {
  cep?: string
  localidade?: string
  uf?: string
  erro?: boolean | string
}

// Public third-party service: its own client, so the app's session cookie and
// base URL never go along with these requests.
const viaCep = axios.create({ baseURL: 'https://viacep.com.br/ws', timeout: 5000 })

export function parseViaCepResponse(cep: string, data: ViaCepResponse): Address {
  if (data.erro || !data.localidade || !data.uf) throw new CepNotFoundError(cep)
  return { cep, city: data.localidade, state: data.uf }
}

/** Looks up an 8-digit CEP. Network/service failures reject with the raw error. */
export async function lookupCep(cep: string): Promise<Address> {
  const { data } = await viaCep.get<ViaCepResponse>(`/${cep}/json/`)
  return parseViaCepResponse(cep, data)
}
