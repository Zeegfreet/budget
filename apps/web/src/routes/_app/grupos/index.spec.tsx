import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import {
  acceptInvitation,
  createGroup,
  declineInvitation,
  fetchGroup,
  fetchGroups,
  fetchReceivedInvitations,
} from '@/features/groups/api'
import { ApiError } from '@/lib/api/client'
import { receivedInvitation, stubGroupsApi } from '@/test/groups'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/groups/api')

async function openGroups() {
  const result = await renderRoute('/grupos')
  await screen.findByRole('heading', { name: 'Grupos', level: 1 })
  return result
}

describe('Groups route (/grupos)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue({ id: 1, name: 'Ana Souza', email: 'ana@example.com' })
    stubGroupsApi()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the user’s groups, linking to each one', async () => {
    await openGroups()

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByRole('link', { name: 'Grupos' })).toHaveAttribute('data-active', 'true')
    const item = within(screen.getByRole('list', { name: 'Meus grupos' })).getByRole('listitem', { name: 'República' })
    expect(item).toHaveTextContent('Dono')
    expect(item).toHaveTextContent('2 membros · Rua A, 10')
    expect(within(item).getByRole('link')).toHaveAttribute('href', '/grupos/7')
    expect(screen.queryByRole('region', { name: 'Convites recebidos' })).not.toBeInTheDocument()
  })

  it('shows an empty state without groups', async () => {
    vi.mocked(fetchGroups).mockResolvedValue([])
    await openGroups()

    expect(screen.getByText('Você ainda não participa de nenhum grupo')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Novo grupo' })).toHaveLength(2)
  })

  it('creates a group and opens it', async () => {
    const { router } = await openGroups()

    await userEvent.click(screen.getByRole('button', { name: 'Novo grupo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Novo grupo' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar grupo' }))
    expect(within(dialog).getByText('Informe o nome do grupo.')).toBeInTheDocument()
    expect(createGroup).not.toHaveBeenCalled()

    await userEvent.type(within(dialog).getByLabelText('Nome'), '  República ')
    await userEvent.type(within(dialog).getByLabelText('Descrição (opcional)'), 'Rua A, 10')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar grupo' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/grupos/7'))
    expect(createGroup).toHaveBeenCalledWith({ name: 'República', description: 'Rua A, 10' })
    expect(await screen.findByRole('heading', { name: 'República', level: 1 })).toBeInTheDocument()
  })

  it('shows the API error when creating fails', async () => {
    vi.mocked(createGroup).mockRejectedValue(new ApiError(400, ['name must be shorter than or equal to 60 characters']))
    await openGroups()

    await userEvent.click(screen.getByRole('button', { name: 'Novo grupo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Novo grupo' })
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Casa')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar grupo' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('name must be shorter')
  })

  describe('received invitations', () => {
    beforeEach(() => {
      stubGroupsApi({ received: [receivedInvitation] })
    })

    it('accepts an invitation, joining the group', async () => {
      await openGroups()
      const invitation = within(screen.getByRole('region', { name: 'Convites recebidos' })).getByRole('listitem', {
        name: 'Casa da praia',
      })
      expect(invitation).toHaveTextContent('Convite de Diego (diego@example.com)')

      vi.mocked(fetchReceivedInvitations).mockResolvedValue([])
      vi.mocked(fetchGroups).mockResolvedValue([
        { id: 7, name: 'República', description: null, role: 'OWNER', memberCount: 2 },
        { id: 8, name: 'Casa da praia', description: null, role: 'MEMBER', memberCount: 3 },
      ])
      await userEvent.click(within(invitation).getByRole('button', { name: 'Aceitar' }))

      expect(acceptInvitation).toHaveBeenCalledWith(40)
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Convites recebidos' })).not.toBeInTheDocument())
      expect(within(screen.getByRole('list', { name: 'Meus grupos' })).getByRole('listitem', { name: 'Casa da praia' }))
        .toHaveTextContent('3 membros')
    })

    it('declines an invitation', async () => {
      await openGroups()
      vi.mocked(fetchReceivedInvitations).mockResolvedValue([])

      await userEvent.click(screen.getByRole('button', { name: 'Recusar' }))

      expect(declineInvitation).toHaveBeenCalledWith(40)
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Convites recebidos' })).not.toBeInTheDocument())
      expect(acceptInvitation).not.toHaveBeenCalled()
    })

    it('says when the invitation is gone', async () => {
      const error = vi.spyOn(toast, 'error')
      vi.mocked(acceptInvitation).mockRejectedValue(new ApiError(404, ['Invitation not found']))
      await openGroups()

      await userEvent.click(screen.getByRole('button', { name: 'Aceitar' }))

      await waitFor(() => expect(error).toHaveBeenCalledWith('Não encontrado. Atualize a página.'))
    })
  })

  it('opens a group the user is not in as not found', async () => {
    vi.mocked(fetchGroup).mockRejectedValue(new ApiError(404, ['Group not found']))
    await renderRoute('/grupos/99')

    expect(await screen.findByText('Grupo não encontrado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver meus grupos' })).toHaveAttribute('href', '/grupos')
  })

  it('treats an invalid id in the URL as not found', async () => {
    await renderRoute('/grupos/abc')

    expect(await screen.findByText('Grupo não encontrado')).toBeInTheDocument()
    expect(fetchGroup).not.toHaveBeenCalled()
  })
})
