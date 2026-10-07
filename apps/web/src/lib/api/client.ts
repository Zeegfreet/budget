import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

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
  // Send the session cookie (needs CORS with credentials if the API is on another origin)
  withCredentials: true,
})

/**
 * Calls whose 401 must not trigger a refresh: it means bad credentials or no
 * session at all, and refreshing from them could loop.
 */
const noRefreshPaths = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

let refreshing: Promise<void> | null = null

/**
 * Swaps the refresh cookie for a new session. Concurrent callers share one
 * request, since each refresh token can be used only once.
 */
export function refreshSession(): Promise<void> {
  refreshing ??= api
    .post('/auth/refresh')
    .then(() => undefined)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

function shouldRefresh(error: unknown): error is AxiosError & { config: RetriableConfig } {
  if (!(error instanceof AxiosError) || error.response?.status !== 401) return false
  const config = error.config as RetriableConfig | undefined
  if (!config || config._retried) return false
  return !noRefreshPaths.some((path) => config.url?.startsWith(path))
}

// The session is an httpOnly cookie set by the API; no auth header is needed.
// The access token is short-lived: on a 401, refresh once and replay the request.
api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (shouldRefresh(error)) {
      error.config._retried = true
      try {
        await refreshSession()
      } catch {
        // Refresh failed: the session is over, report the original 401
        throw toApiError(error)
      }
      return api(error.config)
    }
    throw toApiError(error)
  },
)
