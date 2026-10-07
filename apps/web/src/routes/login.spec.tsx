import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe, login } from '@/features/auth/api'
import {
  defaultLoginErrorMessage,
  invalidCredentialsMessage,
  serverUnavailableMessage,
  tooManyAttemptsMessage,
} from '@/features/auth/errors'
import { ApiError } from '@/lib/api/client'
import { stubBudgetApi } from '@/test/budget'
import { renderRoute } from '@/test/render'

// Signing in lands on the dashboard, which loads the budget
vi.mock('@/features/budget/api')
vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))

const fetchMeMock = vi.mocked(fetchMe)
const loginMock = vi.mocked(login)

const ana = { id: 1, name: 'Ana', email: 'ana@example.com' }

async function fillAndSubmit(email: string, password: string) {
  if (email) await userEvent.type(screen.getByLabelText('E-mail'), email)
  if (password) await userEvent.type(screen.getByLabelText('Senha'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('Login route (/login)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    stubBudgetApi()
    fetchMeMock.mockRejectedValue(new ApiError(401, ['Unauthorized']))
  })

  describe('layout', () => {
    it('renders the form and social sign-in without the app header', async () => {
      await renderRoute('/login')

      expect(screen.getByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
      expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email')
      expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password')
      expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('offers only GitHub and Google sign-in links to the API OAuth endpoints', async () => {
      await renderRoute('/login')

      expect(screen.getByRole('link', { name: 'Continuar com GitHub' })).toHaveAttribute(
        'href',
        '/api/auth/github',
      )
      expect(screen.getByRole('link', { name: 'Continuar com Google (Gmail)' })).toHaveAttribute(
        'href',
        '/api/auth/google',
      )
      expect(screen.getAllByRole('link')).toHaveLength(3)
      expect(screen.queryByText(/Microsoft/)).not.toBeInTheDocument()
    })

    it('links to the sign-up page, keeping ?redirect', async () => {
      await renderRoute('/login?redirect=%2Fgroups')

      expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
        'href',
        '/signup?redirect=%2Fgroups',
      )
    })

    it('toggles password visibility', async () => {
      await renderRoute('/login')

      await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))

      expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'text')
    })
  })

  describe('validation', () => {
    it('requires e-mail and password without calling the API', async () => {
      await renderRoute('/login')

      await fillAndSubmit('', '')

      expect(screen.getByText('Informe seu e-mail.')).toBeInTheDocument()
      expect(screen.getByText('Informe sua senha.')).toBeInTheDocument()
      expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true')
      expect(loginMock).not.toHaveBeenCalled()
    })

    it('rejects a malformed e-mail', async () => {
      await renderRoute('/login')

      await fillAndSubmit('ana@', 'segredo123')

      expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument()
      expect(loginMock).not.toHaveBeenCalled()
    })
  })

  describe('sign-in', () => {
    it('signs in with trimmed e-mail and goes to the home page', async () => {
      loginMock.mockResolvedValue(ana)
      const { router } = await renderRoute('/login')

      await fillAndSubmit('  ana@example.com ', 'segredo123')

      expect(loginMock).toHaveBeenCalledWith(
        { email: 'ana@example.com', password: 'segredo123' },
        expect.anything(),
      )
      expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/')
      expect(screen.getByRole('button', { name: /menu da conta/i })).toHaveTextContent('ana@example.com')
    })

    it('returns to the internal page in ?redirect', async () => {
      loginMock.mockResolvedValue(ana)
      const { router } = await renderRoute('/login?redirect=%2F%3Ftab%3Dgroups')

      await fillAndSubmit('ana@example.com', 'segredo123')

      await waitFor(() => expect(router.state.location.href).toBe('/?tab=groups'))
    })

    it('ignores an external ?redirect (open redirect)', async () => {
      loginMock.mockResolvedValue(ana)
      const { router } = await renderRoute('/login?redirect=%2F%2Fevil.com')

      await fillAndSubmit('ana@example.com', 'segredo123')

      expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
      expect(router.state.location.href).toBe('/')
    })

    it('disables the submit button while signing in', async () => {
      loginMock.mockReturnValue(new Promise(() => {}))
      await renderRoute('/login')

      await fillAndSubmit('ana@example.com', 'segredo123')

      expect(screen.getByRole('button', { name: /Entrar/ })).toBeDisabled()
      expect(screen.getByRole('status', { name: 'Entrando' })).toBeInTheDocument()
    })
  })

  describe('failures', () => {
    it('shows a generic message on bad credentials, clears the password and keeps the e-mail', async () => {
      loginMock.mockRejectedValue(new ApiError(401, ['Invalid credentials']))
      await renderRoute('/login')

      await fillAndSubmit('ana@example.com', 'errada')

      expect(await screen.findByRole('alert')).toHaveTextContent(invalidCredentialsMessage)
      expect(screen.getByLabelText('Senha')).toHaveValue('')
      expect(screen.getByLabelText('Senha')).toHaveFocus()
      expect(screen.getByLabelText('E-mail')).toHaveValue('ana@example.com')
    })

    it('explains rate limiting', async () => {
      loginMock.mockRejectedValue(new ApiError(429, ['Too Many Requests']))
      await renderRoute('/login')

      await fillAndSubmit('ana@example.com', 'segredo123')

      expect(await screen.findByRole('alert')).toHaveTextContent(tooManyAttemptsMessage)
    })

    it('handles the API being unreachable', async () => {
      loginMock.mockRejectedValue(new ApiError(0, ['Network Error']))
      await renderRoute('/login')

      await fillAndSubmit('ana@example.com', 'segredo123')

      expect(await screen.findByRole('alert')).toHaveTextContent(serverUnavailableMessage)
    })
  })

  describe('session and OAuth callback', () => {
    it('sends an already signed-in user to the home page', async () => {
      fetchMeMock.mockResolvedValue(ana)
      const { router } = await renderRoute('/login')

      expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/')
    })

    it('explains a cancelled OAuth sign-in', async () => {
      await renderRoute('/login?error=access_denied')

      expect(screen.getByRole('alert')).toHaveTextContent('Você cancelou o login')
    })

    it('shows a generic message for unknown OAuth errors', async () => {
      await renderRoute('/login?error=server_error')

      expect(screen.getByRole('alert')).toHaveTextContent(defaultLoginErrorMessage)
    })

    it('ignores an empty error param', async () => {
      await renderRoute('/login?error=')

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
