import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe, fetchPasswordReset, resetPassword } from '@/features/auth/api'
import {
  invalidPasswordMessage,
  invalidPasswordResetLinkMessage,
  tooManyAttemptsMessage,
} from '@/features/auth/errors'
import { ApiError } from '@/lib/api/client'
import { makeAuthUser } from '@/test/auth'
import { stubBudgetApi } from '@/test/budget'
import { renderRoute } from '@/test/render'

// Resetting lands on the dashboard, which loads the budget
vi.mock('@/features/budget/api')
vi.mock('@/features/auth/api', () => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  resendActivation: vi.fn(),
  requestPasswordReset: vi.fn(),
  fetchPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}))

const TOKEN = 'a'.repeat(43)
const ana = makeAuthUser()

const field = (label: string) => screen.getByLabelText(label)
const submit = () => userEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }))

async function openForm() {
  const result = await renderRoute(`/redefinir-senha?token=${TOKEN}`)
  await screen.findByRole('heading', { name: 'Criar nova senha' })
  return result
}

async function fill(password: string, confirmation = password) {
  await userEvent.type(field('Nova senha'), password)
  await userEvent.type(field('Repetir nova senha'), confirmation)
}

describe('Reset password route (/redefinir-senha)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    stubBudgetApi()
    vi.mocked(fetchMe).mockRejectedValue(new ApiError(401, ['Unauthorized']))
    vi.mocked(fetchPasswordReset).mockResolvedValue({ email: 'ana@example.com', name: 'Ana Souza' })
  })

  it('shows whose password the link sets, without using it', async () => {
    await openForm()

    expect(fetchPasswordReset).toHaveBeenCalledWith(TOKEN)
    expect(field('E-mail')).toHaveValue('ana@example.com')
    expect(field('E-mail')).toBeDisabled()
    expect(screen.getByText(/Olá, Ana Souza!/)).toBeInTheDocument()
    expect(resetPassword).not.toHaveBeenCalled()
  })

  it('validates the new password without calling the API', async () => {
    await openForm()

    await submit()
    expect(screen.getByText('Crie uma senha.')).toBeInTheDocument()
    expect(screen.getByText('Confirme sua senha.')).toBeInTheDocument()

    await fill('curta')
    await submit()
    expect(screen.getByText('Use pelo menos 8 caracteres.')).toBeInTheDocument()

    await userEvent.clear(field('Nova senha'))
    await userEvent.clear(field('Repetir nova senha'))
    await fill('novaSenha456', 'outraSenha789')
    await submit()
    expect(screen.getByText('As senhas não coincidem.')).toBeInTheDocument()
    expect(resetPassword).not.toHaveBeenCalled()
  })

  it('sets the password and opens the dashboard signed in', async () => {
    vi.mocked(resetPassword).mockResolvedValue(ana)
    const { router } = await openForm()

    await fill('novaSenha456')
    vi.mocked(fetchMe).mockResolvedValue(ana)
    await submit()

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(resetPassword).toHaveBeenCalledWith(
      { token: TOKEN, password: 'novaSenha456' },
      expect.anything(),
    )
    expect(router.state.location.pathname).toBe('/')
  })

  it('clears the fields and explains a rejected password', async () => {
    vi.mocked(resetPassword).mockRejectedValue(new ApiError(400, ['password too short']))
    await openForm()

    await fill('novaSenha456')
    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(invalidPasswordMessage)
    expect(field('Nova senha')).toHaveValue('')
    expect(field('Repetir nova senha')).toHaveValue('')
  })

  it('explains too many attempts and keeps the form', async () => {
    vi.mocked(resetPassword).mockRejectedValue(new ApiError(429, ['Too Many Requests']))
    await openForm()

    await fill('novaSenha456')
    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(tooManyAttemptsMessage)
    expect(field('Nova senha')).toBeInTheDocument()
  })

  it('offers a new link when the link stopped working meanwhile', async () => {
    vi.mocked(resetPassword).mockRejectedValue(new ApiError(404, ['Invalid or expired password reset link']))
    await openForm()

    await fill('novaSenha456')
    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(invalidPasswordResetLinkMessage)
    expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pedir novo link' })).toHaveAttribute('href', '/esqueci-senha')
  })

  it('explains an invalid or expired link', async () => {
    vi.mocked(fetchPasswordReset).mockRejectedValue(new ApiError(404, ['Invalid or expired password reset link']))
    const { router } = await renderRoute(`/redefinir-senha?token=${TOKEN}`)

    expect(await screen.findByRole('alert')).toHaveTextContent(invalidPasswordResetLinkMessage)

    await userEvent.click(screen.getByRole('link', { name: 'Pedir novo link' }))
    expect(await screen.findByRole('heading', { name: 'Esqueci minha senha' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/esqueci-senha')
  })

  it('explains a missing token without calling the API', async () => {
    await renderRoute('/redefinir-senha')

    expect(screen.getByRole('alert')).toHaveTextContent(invalidPasswordResetLinkMessage)
    expect(fetchPasswordReset).not.toHaveBeenCalled()
  })
})
