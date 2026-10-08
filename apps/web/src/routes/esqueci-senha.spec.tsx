import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe, requestPasswordReset } from '@/features/auth/api'
import { passwordResetSentMessage, tooManyAttemptsMessage } from '@/features/auth/errors'
import { ApiError } from '@/lib/api/client'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  resendActivation: vi.fn(),
  requestPasswordReset: vi.fn(),
}))

const emailField = () => screen.getByLabelText('E-mail')
const send = () => userEvent.click(screen.getByRole('button', { name: 'Enviar link' }))

describe('Forgot password route (/esqueci-senha)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(fetchMe).mockRejectedValue(new ApiError(401, ['Unauthorized']))
  })

  it('renders the form outside the app shell', async () => {
    await renderRoute('/esqueci-senha')

    expect(screen.getByRole('heading', { name: 'Esqueci minha senha' })).toBeInTheDocument()
    expect(emailField()).toHaveValue('')
    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument()
  })

  it('validates the e-mail without calling the API', async () => {
    await renderRoute('/esqueci-senha')

    await send()
    expect(screen.getByText('Informe seu e-mail.')).toBeInTheDocument()

    await userEvent.type(emailField(), 'ana@')
    await send()
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument()
    expect(requestPasswordReset).not.toHaveBeenCalled()
  })

  it('sends the trimmed e-mail and answers the same whether it has an account or not', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue()
    await renderRoute('/esqueci-senha')

    await userEvent.type(emailField(), '  ana@example.com ')
    await send()

    expect(await screen.findByRole('status')).toHaveTextContent(passwordResetSentMessage)
    expect(requestPasswordReset).toHaveBeenCalledWith('ana@example.com', expect.anything())
  })

  it('starts with the e-mail typed on the login', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue()
    await renderRoute('/esqueci-senha?email=ana%40example.com')

    expect(emailField()).toHaveValue('ana@example.com')
    await send()

    expect(requestPasswordReset).toHaveBeenCalledWith('ana@example.com', expect.anything())
  })

  it('explains too many attempts', async () => {
    vi.mocked(requestPasswordReset).mockRejectedValue(new ApiError(429, ['Too Many Requests']))
    await renderRoute('/esqueci-senha?email=ana%40example.com')

    await send()

    expect(await screen.findByRole('alert')).toHaveTextContent(tooManyAttemptsMessage)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('goes back to the login', async () => {
    const { router } = await renderRoute('/esqueci-senha')

    await userEvent.click(screen.getByRole('link', { name: 'Voltar para o login' }))

    expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })
})
