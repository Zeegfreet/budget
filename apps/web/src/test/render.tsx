import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, type RenderOptions } from '@testing-library/react'
import { createAppRouter } from '@/router'

/** Fresh client per test: no retries, no shared cache between tests. */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  })
}

export function renderWithProviders(
  ui: React.ReactElement,
  { queryClient = createTestQueryClient(), ...options }: RenderOptions & { queryClient?: QueryClient } = {},
) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
      options,
    ),
  }
}

/** Renders the real route tree at `path`, as the app does in the browser. */
export async function renderRoute(path: string, queryClient = createTestQueryClient()) {
  const router = createAppRouter(
    queryClient,
    createMemoryHistory({ initialEntries: [path] }),
  )
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  await router.load()
  return { router, queryClient, ...result }
}
