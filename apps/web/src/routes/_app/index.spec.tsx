import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe, logout } from '@/features/auth/api'
import { ApiError } from '@/lib/api/client'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))

const fetchMeMock = vi.mocked(fetchMe)
const logoutMock = vi.mocked(logout)

const unauthorized = new ApiError(401, ['Unauthorized'])

describe('Home route (/)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fetchMeMock.mockResolvedValue({ id: 1, name: 'Ana', email: 'ana@example.com' })
  })

  it('renders the app layout and greets the signed-in user', async () => {
    fetchMeMock.mockResolvedValue({ id: 1, name: 'Ana Souza', email: 'ana@example.com' })

    await renderRoute('/')

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Olá, Ana!' })).toBeInTheDocument()
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma movimentação ainda')).toBeInTheDocument()
  })

  describe('access control', () => {
    it('redirects signed-out visitors to /login and never renders the page', async () => {
      fetchMeMock.mockRejectedValue(unauthorized)

      const { router } = await renderRoute('/')

      expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(router.state.location.search).toEqual({ redirect: '/' })
      expect(screen.queryByRole('banner')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Olá, Ana!' })).not.toBeInTheDocument()
    })

    it.each([
      ['API offline (proxy 502)', new ApiError(502, ['Bad Gateway'])],
      ['auth routes not deployed (404)', new ApiError(404, ['Cannot GET /auth/me'])],
      ['network error', new ApiError(0, ['Network Error'])],
    ])('treats a failed session check as signed out: %s', async (_, error) => {
      fetchMeMock.mockRejectedValue(error)

      const { router } = await renderRoute('/')

      expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    })

    it('signs out, drops cached data and goes back to /login', async () => {
      logoutMock.mockResolvedValue()
      const { router, queryClient } = await renderRoute('/')
      await screen.findByRole('heading', { name: 'Olá, Ana!' })

      fetchMeMock.mockRejectedValue(unauthorized)
      await userEvent.click(screen.getByRole('button', { name: 'Sair' }))

      expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
      expect(logoutMock).toHaveBeenCalled()
      expect(router.state.location.pathname).toBe('/login')
      expect(queryClient.getQueryData(['auth', 'me'])).toBeUndefined()
    })

    it('still signs out locally when the logout request fails', async () => {
      logoutMock.mockRejectedValue(new ApiError(0, ['Network Error']))
      const { router } = await renderRoute('/')

      fetchMeMock.mockRejectedValue(unauthorized)
      await userEvent.click(screen.getByRole('button', { name: 'Sair' }))

      expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
    })
  })
})
