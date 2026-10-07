import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom doesn't implement scrollTo; the router calls it on navigation
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo

// jsdom has no matchMedia; the sidebar uses it to detect mobile viewports
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as MediaQueryList

// Radix menus rely on pointer capture and scrollIntoView, missing in jsdom
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.scrollIntoView ??= () => {}

// Radix switches and checkboxes measure themselves with ResizeObserver
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  cleanup()
  // Sidebar state persists in a cookie; don't leak it between tests
  document.cookie = 'sidebar_state=; path=/; max-age=0'
})
