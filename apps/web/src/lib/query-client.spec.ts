import { describe, expect, it } from 'vitest'
import { ApiError } from './api/client'
import { shouldRetry } from './query-client'

describe('shouldRetry', () => {
  it('does not retry 4xx API errors', () => {
    expect(shouldRetry(0, new ApiError(400, ['bad'])))
      .toBe(false)
    expect(shouldRetry(0, new ApiError(404, ['missing']))).toBe(false)
  })

  it('retries server and network errors up to the limit', () => {
    expect(shouldRetry(0, new ApiError(500, ['x']))).toBe(true)
    expect(shouldRetry(1, new ApiError(0, ['offline']))).toBe(true)
    expect(shouldRetry(2, new ApiError(503, ['x']))).toBe(false)
  })
})
