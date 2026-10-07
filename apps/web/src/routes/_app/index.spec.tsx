import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe, logout } from '@/features/auth/api'
import { ApiError } from '@/lib/api/client'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))

const fetchMeMock = vi.mocked(fetchMe)
const logoutMock = vi.mocked(logout)

const unauthorized = new ApiError(401, ['Unauthorized'])

const openUserMenu = () =>
  userEvent.click(screen.getByRole('button', { name: /menu da conta/i }))

describe('Home route (/)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fetchMeMock.mockResolvedValue({ id: 1, name: 'Ana Souza', email: 'ana@example.com' })
  })

  it('renders the side menu and greets the signed-in user', async () => {
    await renderRoute('/')

    expect(await screen.findByRole('heading', { name: 'Olá, Ana!' })).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByRole('link', { name: 'Início' })).toHaveAttribute('data-active', 'true')
    expect(screen.getByText('Nenhuma movimentação ainda')).toBeInTheDocument()
  })

  describe('side menu', () => {
    it('shows the user avatar, name and e-mail at the bottom', async () => {
      await renderRoute('/')

      const account = await screen.findByRole('button', { name: 'Menu da conta de Ana Souza' })
      expect(within(account).getByText('AS')).toBeInTheDocument()
      expect(within(account).getByText('Ana Souza')).toBeInTheDocument()
      expect(within(account).getByText('ana@example.com')).toBeInTheDocument()
    })

    it('collapses and expands, remembering the choice', async () => {
      await renderRoute('/')
      const sidebar = () => document.querySelector('[data-slot="sidebar"]')
      expect(sidebar()).toHaveAttribute('data-state', 'expanded')

      const toggle = screen.getByRole('button', { name: 'Alternar menu lateral' })
      await userEvent.click(toggle)
      expect(sidebar()).toHaveAttribute('data-state', 'collapsed')
      expect(sidebar()).toHaveAttribute('data-collapsible', 'icon')
      expect(document.cookie).toContain('sidebar_state=false')

      await userEvent.click(toggle)
      expect(sidebar()).toHaveAttribute('data-state', 'expanded')
      expect(document.cookie).toContain('sidebar_state=true')
    })

    it('starts collapsed when it was collapsed before', async () => {
      document.cookie = 'sidebar_state=false; path=/'

      await renderRoute('/')

      expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute('data-state', 'collapsed')
    })

    it('opens the account menu with the profile, password and sign-out options', async () => {
      await renderRoute('/')

      await openUserMenu()

      const menu = await screen.findByRole('menu')
      expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'Editar perfil',
        'Alterar senha',
        'Sair',
      ])
    })

    it.each([
      ['Editar perfil', '/settings/profile'],
      ['Alterar senha', '/settings/password'],
    ])('"%s" opens %s', async (option, path) => {
      const { router } = await renderRoute('/')

      await openUserMenu()
      await userEvent.click(await screen.findByRole('menuitem', { name: option }))

      expect(await screen.findByRole('heading', { name: option })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe(path)
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  describe('access control', () => {
    it('redirects signed-out visitors to /login and never renders the page', async () => {
      fetchMeMock.mockRejectedValue(unauthorized)

      const { router } = await renderRoute('/')

      expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(router.state.location.search).toEqual({ redirect: '/' })
      expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument()
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
      expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument()
    })

    it('signs out from the account menu, drops cached data and goes back to /login', async () => {
      logoutMock.mockResolvedValue()
      const { router, queryClient } = await renderRoute('/')
      await screen.findByRole('heading', { name: 'Olá, Ana!' })

      fetchMeMock.mockRejectedValue(unauthorized)
      await openUserMenu()
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }))

      expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
      expect(logoutMock).toHaveBeenCalled()
      expect(router.state.location.pathname).toBe('/login')
      expect(queryClient.getQueryData(['auth', 'me'])).toBeUndefined()
    })

    it('still signs out locally when the logout request fails', async () => {
      logoutMock.mockRejectedValue(new ApiError(0, ['Network Error']))
      const { router } = await renderRoute('/')

      fetchMeMock.mockRejectedValue(unauthorized)
      await openUserMenu()
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }))

      expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
    })
  })
})
