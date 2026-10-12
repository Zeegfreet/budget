import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchGrants, fetchMcpInfo, revokeGrant } from '@/features/agents/api'
import { fetchMe } from '@/features/auth/api'
import { ApiError } from '@/lib/api/client'
import { makeGrant } from '@/test/agents'
import { makeAuthUser } from '@/test/auth'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
}))
vi.mock('@/features/agents/api', () => ({
  fetchAuthorizationRequest: vi.fn(),
  decideAuthorizationRequest: vi.fn(),
  fetchGrants: vi.fn(),
  revokeGrant: vi.fn(),
  fetchMcpInfo: vi.fn(),
}))

const fetchMeMock = vi.mocked(fetchMe)
const fetchGrantsMock = vi.mocked(fetchGrants)
const revokeGrantMock = vi.mocked(revokeGrant)
const fetchMcpInfoMock = vi.mocked(fetchMcpInfo)
const MCP_URL = 'https://mcp.budget.app/mcp'

async function open() {
  await renderRoute('/settings/agents')
  await screen.findByRole('heading', { name: 'Agentes de IA', level: 1 })
}

describe('Agentes de IA route (/settings/agents)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fetchMeMock.mockResolvedValue(makeAuthUser())
    fetchMcpInfoMock.mockResolvedValue({ mcpUrl: MCP_URL, scopes: ['budget:read', 'budget:write'] })
    fetchGrantsMock.mockResolvedValue([
      makeGrant(),
      makeGrant({ id: 2, client: { name: 'Cursor' }, scopes: ['budget:read'] }),
    ])
    revokeGrantMock.mockResolvedValue()
  })

  it('opens from the account menu', async () => {
    await renderRoute('/settings/password')
    await userEvent.click(await screen.findByRole('button', { name: 'Menu da conta de Ana Souza' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Agentes de IA' }))

    expect(await screen.findByRole('heading', { name: 'Agentes de IA', level: 1 })).toBeInTheDocument()
  })

  it('shows the MCP URL to connect an agent and copies it', async () => {
    const user = userEvent.setup()
    await open()

    await waitFor(() => expect(screen.getByLabelText('URL do servidor MCP')).toHaveValue(MCP_URL))
    expect(screen.getByText(/Qualquer agente ou assistente de IA compatível com MCP/)).toBeInTheDocument()
    const steps = within(screen.getByRole('region', { name: 'Como conectar' }))
    expect(steps.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText(`claude mcp add --transport http budget ${MCP_URL}`)).toBeInTheDocument()
    expect(screen.getByText(`"url": "${MCP_URL}"`)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Copiar URL' }))
    expect(await navigator.clipboard.readText()).toBe(MCP_URL)
    expect(screen.getByRole('button', { name: 'URL copiada' })).toBeInTheDocument()
  })

  it('lists the connected agents with their access', async () => {
    await open()

    const list = await screen.findByRole('list', { name: 'Agentes conectados' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Claude')
    expect(items[0]).toHaveTextContent('Leitura e escrita')
    expect(items[0]).toHaveTextContent('Conectado em 01/10/2026')
    expect(items[1]).toHaveTextContent('Cursor')
    expect(items[1]).toHaveTextContent('Somente leitura')
  })

  it('shows an empty state without connections', async () => {
    fetchGrantsMock.mockResolvedValue([])
    await open()

    expect(await screen.findByText('Nenhum agente conectado')).toBeInTheDocument()
  })

  it('disconnects an agent after confirming', async () => {
    await open()
    await userEvent.click(await screen.findByRole('button', { name: 'Desconectar Cursor' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Desconectar Cursor?' })
    fetchGrantsMock.mockResolvedValue([makeGrant()])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(revokeGrantMock).toHaveBeenCalledWith(2, expect.anything())
    await waitFor(() =>
      expect(within(screen.getByRole('list', { name: 'Agentes conectados' })).getAllByRole('listitem')).toHaveLength(1),
    )
  })

  it('keeps the dialog open with the error when disconnecting fails', async () => {
    revokeGrantMock.mockRejectedValue(new ApiError(500, ['Internal']))
    await open()
    await userEvent.click(await screen.findByRole('button', { name: 'Desconectar Claude' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Não foi possível desconectar o agente')
  })
})
