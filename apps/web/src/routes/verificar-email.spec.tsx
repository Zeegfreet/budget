import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe, resendActivation } from '@/features/auth/api'
import { activationSentMessage, tooManyAttemptsMessage } from '@/features/auth/errors'
import { ApiError } from '@/lib/api/client'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  resendActivation: vi.fn(),
}))

const resend = () => userEvent.click(screen.getByRole('button', { name: 'Reenviar e-mail de ativação' }))

describe('Verify e-mail route (/verificar-email)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(fetchMe).mockRejectedValue(new ApiError(401, ['Unauthorized']))
  })

  it('says where the link went and links to the login', async () => {
    await renderRoute('/verificar-email?email=ana%40example.com')

    expect(screen.getByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login')
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument()
  })

  it('sends the link again to that e-mail', async () => {
    vi.mocked(resendActivation).mockResolvedValue()
    await renderRoute('/verificar-email?email=ana%40example.com')

    await resend()

    expect(await screen.findByRole('status')).toHaveTextContent(activationSentMessage)
    expect(resendActivation).toHaveBeenCalledWith('ana@example.com', expect.anything())
  })

  it('explains a failed resend', async () => {
    vi.mocked(resendActivation).mockRejectedValue(new ApiError(429, ['Too Many Requests']))
    await renderRoute('/verificar-email?email=ana%40example.com')

    await resend()

    expect(await screen.findByRole('alert')).toHaveTextContent(tooManyAttemptsMessage)
  })

  it('asks for the e-mail when the page has none', async () => {
    vi.mocked(resendActivation).mockResolvedValue()
    await renderRoute('/verificar-email')

    await resend()
    expect(screen.getByText('Informe seu e-mail.')).toBeInTheDocument()
    expect(resendActivation).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@')
    await resend()
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('E-mail'), 'example.com')
    await resend()
    expect(resendActivation).toHaveBeenCalledWith('ana@example.com', expect.anything())
  })
})
