import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMe } from '@/features/auth/api'
import {
  cancelInvitation,
  deleteGroup,
  fetchGroup,
  fetchGroupInvitations,
  inviteMember,
  leaveGroup,
  removeMember,
  updateGroup,
} from '@/features/groups/api'
import { ApiError } from '@/lib/api/client'
import { ana, bruno, makeGroup, makeMember, pendingInvitation, stubGroupsApi } from '@/test/groups'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/groups/api')

const region = (name: string) => screen.getByRole('region', { name })

async function openMembers() {
  const result = await renderRoute('/grupos/7?tab=membros')
  await screen.findByRole('heading', { name: 'República', level: 1 })
  return result
}

async function groupOption(name: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Opções do grupo' }))
  await userEvent.click(await screen.findByRole('menuitem', { name }))
}

async function invite(email: string, nickname?: string) {
  await userEvent.click(within(region('Membros')).getByRole('button', { name: 'Convidar' }))
  const dialog = await screen.findByRole('dialog', { name: 'Convidar membro' })
  await userEvent.type(within(dialog).getByLabelText('E-mail'), email)
  if (nickname) await userEvent.type(within(dialog).getByLabelText(/^Apelido/), nickname)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar convite' }))
  return dialog
}

describe('Group members (/grupos/$groupId?tab=membros)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
    vi.mocked(fetchMe).mockResolvedValue({ id: 1, name: 'Ana Souza', email: 'ana@example.com' })
    stubGroupsApi()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the members and the pending invitations', async () => {
    await openMembers()

    expect(screen.getByRole('tab', { name: 'Membros' })).toHaveAttribute('aria-selected', 'true')
    const members = within(region('Membros'))
    expect(members.getByRole('listitem', { name: 'Ana' })).toHaveTextContent(/AnaVocêDono/)
    expect(members.getByRole('listitem', { name: 'Bruno' })).toHaveTextContent('bruno@example.com')
    expect(members.queryByRole('button', { name: 'Remover Ana' })).not.toBeInTheDocument()
    expect(within(region('Convites pendentes')).getByRole('listitem', { name: 'carla@example.com' })).toHaveTextContent(
      'convidado por Ana',
    )
  })

  it('invites a registered user by e-mail', async () => {
    await openMembers()
    vi.mocked(fetchGroupInvitations).mockResolvedValue([])

    const dialog = await invite('  Diego@Example.com ')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(inviteMember).toHaveBeenCalledWith(7, { email: 'diego@example.com' })
    expect(dialog).not.toBeInTheDocument()
  })

  it('pre-registers someone without an account under a nickname', async () => {
    const success = vi.spyOn(toast, 'success')
    vi.mocked(inviteMember)
      .mockRejectedValueOnce(new ApiError(400, ['Nickname required for an unregistered e-mail']))
      .mockResolvedValueOnce({
        ...pendingInvitation,
        id: 31,
        status: 'ACCEPTED',
        invitee: { id: 500, name: 'Didi', email: 'diego@example.com', pending: true },
      })
    await openMembers()

    const dialog = await invite('diego@example.com')
    expect(
      await within(dialog).findByText('Essa pessoa ainda não tem conta. Informe um apelido para pré-cadastrá-la.'),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText('Não foi possível enviar o convite.')).not.toBeInTheDocument()

    const didi = makeMember(3, 'Didi', { email: 'diego@example.com', pending: true })
    vi.mocked(fetchGroup).mockResolvedValue(makeGroup({ members: [ana, bruno, didi] }))
    await userEvent.type(within(dialog).getByLabelText(/^Apelido/), ' Didi ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar convite' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(inviteMember).toHaveBeenLastCalledWith(7, { email: 'diego@example.com', nickname: 'Didi' })
    expect(success).toHaveBeenCalledWith('Didi entrou no grupo (pré-cadastro)')
    // The member list was refreshed
    const member = await within(region('Membros')).findByRole('listitem', { name: 'Didi' })
    expect(member).toHaveTextContent('Pré-cadastro')
    expect(within(region('Membros')).getByRole('listitem', { name: 'Bruno' })).not.toHaveTextContent('Pré-cadastro')
  })

  it('validates the nickname', async () => {
    await openMembers()

    const dialog = await invite('diego@example.com', 'D')

    expect(within(dialog).getByText('O apelido deve ter ao menos 2 caracteres.')).toBeInTheDocument()
    expect(inviteMember).not.toHaveBeenCalled()
  })

  it('validates the e-mail before sending', async () => {
    await openMembers()

    const dialog = await invite('diego')

    expect(within(dialog).getByText('Informe um e-mail válido.')).toBeInTheDocument()
    expect(inviteMember).not.toHaveBeenCalled()
  })

  it.each([
    [409, 'Already invited', 'Este usuário já tem um convite pendente.'],
    [409, 'Already a member', 'Este usuário já é membro do grupo.'],
  ])('explains a %i "%s" from the API', async (status, apiMessage, shown) => {
    vi.mocked(inviteMember).mockRejectedValue(new ApiError(status, [apiMessage]))
    await openMembers()

    const dialog = await invite('diego@example.com')

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(shown)
  })

  it('cancels a pending invitation', async () => {
    await openMembers()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar convite de Carla' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Cancelar convite' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancelar convite' }))

    await waitFor(() => expect(cancelInvitation).toHaveBeenCalledWith(7, pendingInvitation.id))
  })

  it('lets the owner remove a member', async () => {
    await openMembers()
    vi.mocked(fetchGroup).mockResolvedValue(makeGroup({ members: [ana] }))

    await userEvent.click(screen.getByRole('button', { name: 'Remover Bruno' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Remover membro' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remover' }))

    await waitFor(() => expect(removeMember).toHaveBeenCalledWith(7, bruno.id))
    await waitFor(() =>
      expect(within(region('Membros')).queryByRole('listitem', { name: 'Bruno' })).not.toBeInTheDocument(),
    )
  })

  describe('as a member who is not the owner', () => {
    beforeEach(() => {
      stubGroupsApi({ group: makeGroup({ role: 'MEMBER', memberId: bruno.id }) })
    })

    it('hides the owner’s actions', async () => {
      await openMembers()

      expect(screen.queryByRole('button', { name: /^Remover/ })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Opções do grupo' }))
      expect(await screen.findByRole('menuitem', { name: 'Sair do grupo' })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'Editar grupo' })).not.toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'Excluir grupo' })).not.toBeInTheDocument()
    })

    it('leaves the group and goes back to the list', async () => {
      const { router } = await openMembers()

      await groupOption('Sair do grupo')
      const confirm = await screen.findByRole('alertdialog', { name: 'Sair do grupo' })
      expect(confirm).toHaveTextContent('só um novo convite traz você de volta')
      await userEvent.click(within(confirm).getByRole('button', { name: 'Sair do grupo' }))

      await waitFor(() => expect(router.state.location.pathname).toBe('/grupos'))
      expect(leaveGroup).toHaveBeenCalledWith(7)
    })
  })

  it('renames the group', async () => {
    await openMembers()

    await groupOption('Editar grupo')
    const dialog = await screen.findByRole('dialog', { name: 'Editar grupo' })
    expect(within(dialog).getByLabelText('Nome')).toHaveValue('República')
    await userEvent.clear(within(dialog).getByLabelText('Nome'))
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Casa')
    await userEvent.clear(within(dialog).getByLabelText('Descrição (opcional)'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(updateGroup).toHaveBeenCalledWith(7, { name: 'Casa', description: null }))
  })

  it('deletes the group and goes back to the list', async () => {
    const { router } = await openMembers()

    await groupOption('Excluir grupo')
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir grupo' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir grupo' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/grupos'))
    expect(deleteGroup).toHaveBeenCalledWith(7)
  })
})
