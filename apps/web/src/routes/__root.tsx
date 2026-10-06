import { lazy, Suspense } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { AppLayout } from '@/components/templates'

export interface RouterContext {
  queryClient: QueryClient
}

const Devtools = import.meta.env.DEV
  ? lazy(() => import('@/lib/devtools'))
  : () => null

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <AppLayout>
        <Outlet />
      </AppLayout>
      <Suspense>
        <Devtools />
      </Suspense>
    </>
  )
}
