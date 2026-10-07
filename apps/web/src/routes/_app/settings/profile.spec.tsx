import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import { ApiError } from '@/lib/api/client'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))

const fetchMeMock = vi.mocked(fetchMe)

describe('Editar perfil route (/settings/profile)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fetchMeMock.mockResolvedValue({ id: 1, name: 'Ana Souza', email: 'ana@example.com' })
  })

  it('renders the coming-soon page inside the app layout', async () => {
    await renderRoute('/settings/profile')

    expect(await screen.findByRole('heading', { name: 'Editar perfil' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Em breve' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('data-active', 'false')
  })

  it('redirects signed-out visitors to /login and back here afterwards', async () => {
    fetchMeMock.mockRejectedValue(new ApiError(401, ['Unauthorized']))

    const { router } = await renderRoute('/settings/profile')

    expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toEqual({ redirect: '/settings/profile' })
    expect(screen.queryByRole('heading', { name: 'Editar perfil' })).not.toBeInTheDocument()
  })
})
