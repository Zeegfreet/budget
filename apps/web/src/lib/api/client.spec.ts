import { AxiosError, AxiosHeaders, type AxiosAdapter, type AxiosResponse } from 'axios'
import { describe, expect, it } from 'vitest'
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

describe('api client', () => {
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
    const { data } = await api.get('/user', { adapter })
    expect(data).toEqual([{ id: 1 }])
  })

  it('normalizes Nest validation errors (message array) into ApiError', async () => {
    const adapter = failingAdapter(400, {
      statusCode: 400,
      message: ['email must be an email', 'property foo should not exist'],
      error: 'Bad Request',
    })

    const error = await api.post('/user', {}, { adapter }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 400,
      messages: ['email must be an email', 'property foo should not exist'],
    })
  })

  it('normalizes single-message errors', async () => {
    const adapter = failingAdapter(404, { statusCode: 404, message: 'Not Found' })

    const error = await api.get('/user/99', { adapter }).catch((e: unknown) => e)

    expect(error).toMatchObject({ status: 404, messages: ['Not Found'], message: 'Not Found' })
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
