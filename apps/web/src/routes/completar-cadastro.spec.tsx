import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lookupCep } from '@/features/address/api'
import { fetchMe, logout } from '@/features/auth/api'
import { updateProfile } from '@/features/profile/api'
import type { Profile } from '@/features/profile/types'
import { ApiError } from '@/lib/api/client'
import { makeAuthUser } from '@/test/auth'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
}))
vi.mock('@/features/profile/api', () => ({ fetchProfile: vi.fn(), updateProfile: vi.fn() }))
vi.mock('@/features/address/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/address/api')>()),
  lookupCep: vi.fn(),
}))

const fetchMeMock = vi.mocked(fetchMe)
const updateProfileMock = vi.mocked(updateProfile)
const lookupCepMock = vi.mocked(lookupCep)

/** Just signed up with GitHub: no birth date, address or password yet. */
const oauthUser = makeAuthUser({ name: 'ana-gh', needsProfile: true, hasPassword: false })
const saoPaulo = { cep: '01001000', city: 'São Paulo', state: 'SP' }
const completed: Profile = {
  id: 1,
  email: 'ana@example.com',
  name: 'ana-gh',
  birthDate: '1990-05-20',
  ...saoPaulo,
}

const field = (label: string) => screen.getByLabelText(label)
const submit = () => userEvent.click(screen.getByRole('button', { name: 'Concluir cadastro' }))
const heading = () => screen.findByRole('heading', { name: 'Complete seu cadastro' })

async function fill(birthDate = '1990-05-20', cep = '01001000') {
  await userEvent.type(field('Data de nascimento'), birthDate)
  await userEvent.type(field('CEP'), cep)
  await waitFor(() => expect(field('Cidade')).toHaveValue('São Paulo'))
}

describe('Completar cadastro route (/completar-cadastro)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fetchMeMock.mockResolvedValue(oauthUser)
    lookupCepMock.mockResolvedValue(saoPaulo)
    updateProfileMock.mockResolvedValue(completed)
  })

  describe('guard', () => {
    it('sends an incomplete account here before any internal page', async () => {
      const { router } = await renderRoute('/settings/password')

      expect(await heading()).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/completar-cadastro')
      expect(router.state.location.search).toEqual({ redirect: '/settings/password' })
      expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument()
    })

    it('sends visitors to the login', async () => {
      fetchMeMock.mockRejectedValue(new ApiError(401, ['Unauthorized']))
      const { router } = await renderRoute('/completar-cadastro')

      expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
    })

    it('lets a complete account through to where it was going', async () => {
      fetchMeMock.mockResolvedValue(makeAuthUser())
      const { router } = await renderRoute('/completar-cadastro?redirect=%2Fsettings%2Fpassword')

      expect(await screen.findByRole('heading', { name: 'Alterar senha' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/settings/password')
    })

    it('ignores an external redirect', async () => {
      fetchMeMock.mockResolvedValue(makeAuthUser())
      const { router } = await renderRoute('/completar-cadastro?redirect=%2F%2Fevil.com')

      await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    })
  })

  it('shows the e-mail read-only and the provider name to review', async () => {
    await renderRoute('/completar-cadastro')
    await heading()

    expect(field('E-mail')).toHaveValue('ana@example.com')
    expect(field('E-mail')).toBeDisabled()
    expect(field('Nome')).toHaveValue('ana-gh')
    expect(field('Data de nascimento')).toHaveAttribute('type', 'date')
  })

  it('requires birth date and address without calling the API', async () => {
    await renderRoute('/completar-cadastro')
    await heading()

    await submit()

    for (const message of [
      'Informe sua data de nascimento.',
      'Informe seu CEP.',
      'Informe sua cidade.',
      'Informe a UF.',
    ]) {
      expect(screen.getByText(message)).toBeInTheDocument()
    }
    expect(updateProfileMock).not.toHaveBeenCalled()
  })

  it('rejects someone under 18', async () => {
    await renderRoute('/completar-cadastro')
    await heading()

    await fill(`${new Date().getFullYear() - 10}-01-01`)
    await submit()

    expect(screen.getByText('Você precisa ter pelo menos 18 anos.')).toBeInTheDocument()
    expect(updateProfileMock).not.toHaveBeenCalled()
  })

  it('saves the profile and opens the page the user was going to', async () => {
    const { router } = await renderRoute('/completar-cadastro?redirect=%2Fsettings%2Fpassword')
    await heading()

    await fill()
    await submit()

    expect(await screen.findByRole('heading', { name: 'Alterar senha' })).toBeInTheDocument()
    expect(updateProfileMock).toHaveBeenCalledWith(
      { birthDate: '1990-05-20', ...saoPaulo },
    )
    expect(router.state.location.pathname).toBe('/settings/password')
    // The account has no password: the page says so instead of the form
    expect(screen.getByText('Sua conta não tem senha')).toBeInTheDocument()
  })

  it('sends a corrected name too', async () => {
    updateProfileMock.mockResolvedValue({ ...completed, name: 'Ana Souza' })
    await renderRoute('/completar-cadastro')
    await heading()

    await userEvent.clear(field('Nome'))
    await userEvent.type(field('Nome'), 'Ana Souza')
    await fill()
    await submit()

    await waitFor(() =>
      expect(updateProfileMock).toHaveBeenCalledWith(
        { birthDate: '1990-05-20', ...saoPaulo, name: 'Ana Souza' },
      ),
    )
  })

  it('shows an API error and stays on the page', async () => {
    updateProfileMock.mockRejectedValue(new ApiError(400, ['birthDate must be a date']))
    await renderRoute('/completar-cadastro')
    await heading()

    await fill()
    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Confira os dados informados.')
    expect(screen.getByRole('heading', { name: 'Complete seu cadastro' })).toBeInTheDocument()
  })

  it('lets the user sign out instead', async () => {
    vi.mocked(logout).mockResolvedValue()
    const { router } = await renderRoute('/completar-cadastro')
    await heading()

    fetchMeMock.mockRejectedValue(new ApiError(401, ['Unauthorized']))
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(logout).toHaveBeenCalled()
  })
})
