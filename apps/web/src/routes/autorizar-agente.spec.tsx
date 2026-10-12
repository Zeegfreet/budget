import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decideAuthorizationRequest, fetchAuthorizationRequest } from '@/features/agents/api'
import { fetchMe } from '@/features/auth/api'
import { ApiError } from '@/lib/api/client'
import { assignLocation } from '@/lib/browser'
import { makeAuthorizationRequest } from '@/test/agents'
import { makeAuthUser } from '@/test/auth'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  resendActivation: vi.fn(),
  requestPasswordReset: vi.fn(),
}))
vi.mock('@/features/agents/api', () => ({
  fetchAuthorizationRequest: vi.fn(),
  decideAuthorizationRequest: vi.fn(),
  fetchGrants: vi.fn(),
  revokeGrant: vi.fn(),
  fetchMcpInfo: vi.fn(),
}))
vi.mock('@/lib/browser', () => ({ assignLocation: vi.fn() }))

const fetchMeMock = vi.mocked(fetchMe)
const fetchRequestMock = vi.mocked(fetchAuthorizationRequest)
const decideMock = vi.mocked(decideAuthorizationRequest)
const assignMock = vi.mocked(assignLocation)
const request = makeAuthorizationRequest()
const path = `/autorizar-agente?request=${request.id}`

async function open(url = path) {
  const result = await renderRoute(url)
  await screen.findByRole('heading', { level: 1 })
  return result
}

describe('Autorizar agente route (/autorizar-agente)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fetchMeMock.mockResolvedValue(makeAuthUser())
    fetchRequestMock.mockResolvedValue(request)
  })

  it('sends visitors to the login and back here', async () => {
    fetchMeMock.mockRejectedValue(new ApiError(401, ['Unauthorized']))
    const { router } = await renderRoute(path)

    expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toEqual({ redirect: path })
  })

  it('shows who asks, for which account and what it may do', async () => {
    await open()

    expect(screen.getByRole('heading', { name: 'Conectar Claude' })).toBeInTheDocument()
    expect(screen.getByText(/ana@example\.com/)).toBeInTheDocument()
    expect(screen.getByText('claude.ai')).toBeInTheDocument()
    const scopes = within(screen.getByRole('region', { name: 'O agente poderá:' }))
    expect(scopes.getByText('Ver suas finanças')).toBeInTheDocument()
    expect(scopes.getByText('Alterar suas finanças')).toBeInTheDocument()
    expect(fetchRequestMock).toHaveBeenCalledWith(request.id)
    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument()
  })

  it('lists only the read permission when that is all it asks', async () => {
    fetchRequestMock.mockResolvedValue(makeAuthorizationRequest({ scopes: ['budget:read'] }))
    await open()

    expect(screen.getByText('Ver suas finanças')).toBeInTheDocument()
    expect(screen.queryByText('Alterar suas finanças')).not.toBeInTheDocument()
  })

  it('allows the agent and goes back to it', async () => {
    decideMock.mockResolvedValue('https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz')
    await open()

    await userEvent.click(screen.getByRole('button', { name: 'Permitir' }))

    await waitFor(() =>
      expect(assignMock).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz'),
    )
    expect(decideMock).toHaveBeenCalledWith(request.id, true)
    expect(screen.getByRole('status')).toHaveTextContent('Redirecionando para o agente…')
    expect(screen.getByRole('button', { name: 'Permitir' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Negar' })).toBeDisabled()
  })

  it('denies the agent and goes back to it', async () => {
    decideMock.mockResolvedValue('https://claude.ai/api/mcp/auth_callback?error=access_denied')
    await open()

    await userEvent.click(screen.getByRole('button', { name: 'Negar' }))

    await waitFor(() =>
      expect(assignMock).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?error=access_denied'),
    )
    expect(decideMock).toHaveBeenCalledWith(request.id, false)
  })

  it('explains an expired or already answered request', async () => {
    fetchRequestMock.mockRejectedValue(new ApiError(404, ['Authorization request not found or expired']))
    await open()

    expect(await screen.findByRole('alert')).toHaveTextContent('expirou ou já foi respondido')
    expect(screen.getByRole('link', { name: 'Ir para o Budget' })).toHaveAttribute('href', '/')
  })

  it('keeps the page when the decision fails', async () => {
    decideMock.mockRejectedValue(new ApiError(404, ['Authorization request not found or expired']))
    await open()

    await userEvent.click(screen.getByRole('button', { name: 'Permitir' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('expirou ou já foi respondido')
    expect(assignMock).not.toHaveBeenCalled()
  })

  it.each([
    ['invalid_client', 'não está registrado'],
    ['invalid_redirect_uri', 'endereço de retorno'],
    ['other', 'Não foi possível conectar o agente'],
  ])('translates ?error=%s from the API', async (code, message) => {
    await open(`/autorizar-agente?error=${code}`)

    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(fetchRequestMock).not.toHaveBeenCalled()
  })

  it('handles a link without a request', async () => {
    await open('/autorizar-agente')
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível conectar o agente')
  })
})
