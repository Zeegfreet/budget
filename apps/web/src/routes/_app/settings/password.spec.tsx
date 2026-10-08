import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { changePassword, fetchMe } from '@/features/auth/api'
import { ApiError } from '@/lib/api/client'
import { makeAuthUser } from '@/test/auth'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
}))

const fetchMeMock = vi.mocked(fetchMe)
const changePasswordMock = vi.mocked(changePassword)
const user = makeAuthUser()

const field = (label: string) => screen.getByLabelText(label)
const submit = () => userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }))

async function open() {
  await renderRoute('/settings/password')
  await screen.findByRole('heading', { name: 'Alterar senha' })
}

async function fill(current: string, next: string, confirmation = next) {
  if (current) await userEvent.type(field('Senha atual'), current)
  if (next) await userEvent.type(field('Nova senha'), next)
  if (confirmation) await userEvent.type(field('Repetir nova senha'), confirmation)
}

describe('Alterar senha route (/settings/password)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fetchMeMock.mockResolvedValue(user)
    changePasswordMock.mockResolvedValue(user)
  })

  it('renders the form inside the app layout', async () => {
    await open()

    expect(field('Senha atual')).toHaveAttribute('type', 'password')
    expect(field('Senha atual')).toHaveAttribute('autocomplete', 'current-password')
    expect(field('Nova senha')).toHaveAttribute('autocomplete', 'new-password')
    expect(field('Repetir nova senha')).toHaveAttribute('autocomplete', 'new-password')
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('data-active', 'false')
  })

  it('changes the password and clears the fields', async () => {
    await open()

    await fill('segredo123', 'novaSenha456')
    await submit()

    expect(await screen.findByRole('status')).toHaveTextContent('Senha alterada.')
    expect(changePasswordMock).toHaveBeenCalledWith(
      { currentPassword: 'segredo123', newPassword: 'novaSenha456' },
      expect.anything(),
    )
    expect(field('Senha atual')).toHaveValue('')
    expect(field('Nova senha')).toHaveValue('')
    expect(field('Repetir nova senha')).toHaveValue('')
  })

  it('validates before calling the API', async () => {
    await open()

    await submit()
    expect(screen.getByText('Informe sua senha atual.')).toBeInTheDocument()
    expect(screen.getByText('Crie uma senha.')).toBeInTheDocument()
    expect(screen.getByText('Confirme sua senha.')).toBeInTheDocument()

    await fill('segredo123', 'curta', 'outra')
    await submit()
    expect(screen.getByText('Use pelo menos 8 caracteres.')).toBeInTheDocument()
    expect(screen.getByText('As senhas não coincidem.')).toBeInTheDocument()

    await userEvent.clear(field('Nova senha'))
    await userEvent.type(field('Nova senha'), 'segredo123')
    await userEvent.clear(field('Repetir nova senha'))
    await userEvent.type(field('Repetir nova senha'), 'segredo123')
    await submit()
    expect(screen.getByText('A nova senha deve ser diferente da atual.')).toBeInTheDocument()

    expect(changePasswordMock).not.toHaveBeenCalled()
  })

  it('shows a wrong current password on its field and clears the form', async () => {
    changePasswordMock.mockRejectedValue(new ApiError(403, ['Current password is incorrect']))
    await open()

    await fill('errada123', 'novaSenha456')
    await submit()

    expect(await screen.findByText('Senha atual incorreta.')).toBeInTheDocument()
    expect(field('Senha atual')).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(field('Senha atual')).toHaveFocus())
    expect(field('Senha atual')).toHaveValue('')
    expect(field('Nova senha')).toHaveValue('')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows too many attempts above the form', async () => {
    changePasswordMock.mockRejectedValue(new ApiError(429, ['Too Many Requests']))
    await open()

    await fill('segredo123', 'novaSenha456')
    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Muitas tentativas. Aguarde um pouco e tente de novo.',
    )
  })

  it('redirects signed-out visitors to /login and back here afterwards', async () => {
    fetchMeMock.mockRejectedValue(new ApiError(401, ['Unauthorized']))

    const { router } = await renderRoute('/settings/password')

    expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toEqual({ redirect: '/settings/password' })
    expect(screen.queryByRole('heading', { name: 'Alterar senha' })).not.toBeInTheDocument()
  })

  it('explains that a GitHub/Google account has no password to change', async () => {
    fetchMeMock.mockResolvedValue(makeAuthUser({ hasPassword: false }))
    await open()

    expect(screen.getByText('Sua conta não tem senha')).toBeInTheDocument()
    expect(screen.queryByLabelText('Senha atual')).not.toBeInTheDocument()
  })
})
