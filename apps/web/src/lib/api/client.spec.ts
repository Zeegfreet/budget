import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, toApiError } from './client'

function failingAdapter(status: number, data: unknown): AxiosAdapter {
  return async (config) => {
    const response: AxiosResponse = {
      data,
      status,
      statusText: '',
      headers: {},
      config,
    }
    throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, response)
  }
}

type Reply = { status: number; data?: unknown }

/** Fake transport: answers each request with `respond(config)` and records the URLs. */
function mockTransport(respond: (config: InternalAxiosRequestConfig) => Reply | Promise<Reply>) {
  const calls: string[] = []
  const adapter: AxiosAdapter = async (config) => {
    calls.push(`${config.method?.toUpperCase()} ${config.url}`)
    const { status, data = {} } = await respond(config)
    const response = { status, statusText: '', data, headers: {}, config }
    if (status >= 400) {
      throw new AxiosError(`Request failed with status code ${status}`, undefined, config, null, response)
    }
    return response
  }
  api.defaults.adapter = adapter
  return calls
}

const originalAdapter = api.defaults.adapter

describe('api client', () => {
  afterEach(() => {
    api.defaults.adapter = originalAdapter
  })

  it('uses /api as the default base URL (Vite dev proxy)', () => {
    expect(api.defaults.baseURL).toBe('/api')
  })

  it('returns data on success', async () => {
    const adapter: AxiosAdapter = async (config) => ({
      data: [{ id: 1 }],
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
    const { data } = await api.get('/groups', { adapter })
    expect(data).toEqual([{ id: 1 }])
  })

  it('normalizes Nest validation errors (message array) into ApiError', async () => {
    const adapter = failingAdapter(400, {
      statusCode: 400,
      message: ['email must be an email', 'property foo should not exist'],
      error: 'Bad Request',
    })

    const error = await api.post('/groups', {}, { adapter }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 400,
      messages: ['email must be an email', 'property foo should not exist'],
    })
  })

  it('normalizes single-message errors', async () => {
    const adapter = failingAdapter(404, { statusCode: 404, message: 'Not Found' })

    const error = await api.get('/groups/99', { adapter }).catch((e: unknown) => e)

    expect(error).toMatchObject({ status: 404, messages: ['Not Found'], message: 'Not Found' })
  })

  describe('session refresh', () => {
    let sessionValid: boolean

    beforeEach(() => {
      sessionValid = false
    })

    it('refreshes the session on a 401 and replays the request', async () => {
      const calls = mockTransport((config) => {
        if (config.url === '/auth/refresh') {
          sessionValid = true
          return { status: 200 }
        }
        return sessionValid ? { status: 200, data: { id: 1 } } : { status: 401 }
      })

      const { data } = await api.get('/auth/me')

      expect(data).toEqual({ id: 1 })
      expect(calls).toEqual(['GET /auth/me', 'POST /auth/refresh', 'GET /auth/me'])
    })

    it('rejects with the original 401 when the refresh fails', async () => {
      const calls = mockTransport(() => ({ status: 401, data: { message: 'Unauthorized' } }))

      const error = await api.get('/auth/me').catch((e: unknown) => e)

      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ status: 401, messages: ['Unauthorized'] })
      expect(calls).toEqual(['GET /auth/me', 'POST /auth/refresh'])
    })

    it('replays a request only once', async () => {
      const calls = mockTransport((config) =>
        config.url === '/auth/refresh' ? { status: 200 } : { status: 401 },
      )

      await expect(api.get('/auth/me')).rejects.toMatchObject({ status: 401 })
      expect(calls).toEqual(['GET /auth/me', 'POST /auth/refresh', 'GET /auth/me'])
    })

    it('shares one refresh between concurrent requests', async () => {
      let finishRefresh!: () => void
      const refreshDone = new Promise<void>((resolve) => {
        finishRefresh = resolve
      })
      const calls = mockTransport(async (config) => {
        if (config.url === '/auth/refresh') {
          await refreshDone
          sessionValid = true
          return { status: 200 }
        }
        return sessionValid ? { status: 200, data: config.url } : { status: 401 }
      })

      const both = Promise.all([api.get('/a'), api.get('/b')])
      await vi.waitFor(() => expect(calls).toContain('POST /auth/refresh'))
      finishRefresh()
      const [a, b] = await both

      expect([a.data, b.data]).toEqual(['/a', '/b'])
      expect(calls.filter((c) => c === 'POST /auth/refresh')).toHaveLength(1)
    })

    it.each(['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'])(
      'does not refresh on a 401 from %s',
      async (url) => {
        const calls = mockTransport(() => ({ status: 401 }))

        await expect(api.post(url)).rejects.toMatchObject({ status: 401 })
        expect(calls).toEqual([`POST ${url}`])
      },
    )

    it('does not refresh on other errors', async () => {
      const calls = mockTransport(() => ({ status: 403, data: { message: 'Forbidden' } }))

      await expect(api.get('/auth/me')).rejects.toMatchObject({ status: 403 })
      expect(calls).toEqual(['GET /auth/me'])
    })
  })
})

describe('toApiError', () => {
  it('maps errors without a response to status 0', () => {
    const error = new AxiosError('Network Error', 'ERR_NETWORK', {
      headers: new AxiosHeaders(),
    })
    expect(toApiError(error)).toMatchObject({ status: 0, messages: ['Network Error'] })
  })

  it('wraps unknown errors', () => {
    expect(toApiError(new Error('boom'))).toMatchObject({ status: 0, messages: ['boom'] })
  })

  it('returns ApiError instances unchanged', () => {
    const original = new ApiError(500, ['x'])
    expect(toApiError(original)).toBe(original)
  })
})
