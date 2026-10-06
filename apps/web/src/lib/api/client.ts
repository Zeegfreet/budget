import axios, { AxiosError } from 'axios'

export class ApiError extends Error {
  readonly status: number
  /** Individual messages, e.g. one per field rejected by the API's ValidationPipe */
  readonly messages: string[]

  constructor(status: number, messages: string[]) {
    super(messages.join(', ') || 'Unexpected error')
    this.name = 'ApiError'
    this.status = status
    this.messages = messages
  }
}

/** NestJS error body: `message` is a string, or a string[] for validation errors */
interface NestErrorBody {
  statusCode?: number
  message?: string | string[]
  error?: string
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof AxiosError) {
    if (!error.response) {
      return new ApiError(0, [error.message || 'Network error'])
    }
    const body = error.response.data as NestErrorBody | undefined
    const raw = body?.message ?? body?.error ?? error.message
    return new ApiError(
      error.response.status,
      Array.isArray(raw) ? raw : [raw],
    )
  }
  return new ApiError(0, [error instanceof Error ? error.message : String(error)])
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Auth header injection goes in a request interceptor once auth exists.
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toApiError(error)),
)
