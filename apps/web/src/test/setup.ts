import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom doesn't implement scrollTo; the router calls it on navigation
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo

afterEach(() => {
  cleanup()
})
