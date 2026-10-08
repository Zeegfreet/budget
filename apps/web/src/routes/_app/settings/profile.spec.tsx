import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CepNotFoundError, lookupCep } from '@/features/address/api'
import { fetchMe } from '@/features/auth/api'
import { fetchProfile, updateProfile } from '@/features/profile/api'
import type { Profile } from '@/features/profile/types'
import { ApiError } from '@/lib/api/client'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({ fetchMe: vi.fn(), login: vi.fn(), logout: vi.fn() }))
vi.mock('@/features/profile/api', () => ({ fetchProfile: vi.fn(), updateProfile: vi.fn() }))
vi.mock('@/features/address/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/address/api')>()),
  lookupCep: vi.fn(),
}))

const fetchMeMock = vi.mocked(fetchMe)
const fetchProfileMock = vi.mocked(fetchProfile)
const updateProfileMock = vi.mocked(updateProfile)
const lookupCepMock = vi.mocked(lookupCep)

const profile: Profile = {
  id: 1,
  email: 'ana@example.com',
  name: 'Ana Souza',
  birthDate: '1990-05-20',
  cep: '01001000',
  city: 'São Paulo',
  state: 'SP',
}
const rio = { cep: '20040002', city: 'Rio de Janeiro', state: 'RJ' }

const field = (label: string) => screen.getByLabelText(label)
const saveButton = () => screen.getByRole('button', { name: 'Salvar alterações' })

async function open() {
  await renderRoute('/settings/profile')
  await screen.findByRole('heading', { name: 'Editar perfil' })
}

async function replace(label: string, value: string) {
  await userEvent.clear(field(label))
  if (value) await userEvent.type(field(label), value)
}

describe('Editar perfil route (/settings/profile)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fetchMeMock.mockResolvedValue({ id: 1, name: 'Ana Souza', email: 'ana@example.com' })
    fetchProfileMock.mockResolvedValue(profile)
    updateProfileMock.mockImplementation(async (patch) => ({ ...profile, ...patch }))
  })

  it('shows the current data inside the app layout, with the e-mail read-only', async () => {
    await open()

    expect(field('E-mail')).toHaveValue('ana@example.com')
    expect(field('E-mail')).toBeDisabled()
    expect(field('Nome')).toHaveValue('Ana Souza')
    expect(field('Data de nascimento')).toHaveValue('1990-05-20')
    expect(field('CEP')).toHaveValue('01001-000')
    expect(field('Cidade')).toHaveValue('São Paulo')
    expect(field('UF')).toHaveValue('SP')
    expect(saveButton()).toBeDisabled()
    // The saved CEP isn't looked up again
    expect(lookupCepMock).not.toHaveBeenCalled()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('data-active', 'false')
  })

  it('saves only the name and updates the side menu', async () => {
    await open()

    await replace('Nome', '  Ana Lima ')
    await userEvent.click(saveButton())

    expect(await screen.findByRole('status')).toHaveTextContent('Perfil atualizado.')
    expect(updateProfileMock).toHaveBeenCalledWith({ name: 'Ana Lima' })
    expect(screen.getByRole('button', { name: 'Menu da conta de Ana Lima' })).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()

    // Editing again hides the confirmation
    await userEvent.type(field('Nome'), 's')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('saves the birth date', async () => {
    await open()

    await replace('Data de nascimento', '1985-12-31')
    await userEvent.click(saveButton())

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledWith({ birthDate: '1985-12-31' }))
  })

  it('looks up a new CEP and sends the whole address', async () => {
    lookupCepMock.mockResolvedValue(rio)
    await open()

    await replace('CEP', '20040002')

    await waitFor(() => expect(field('Cidade')).toHaveValue('Rio de Janeiro'))
    expect(field('UF')).toHaveValue('RJ')
    expect(field('Cidade')).toHaveAttribute('readonly')
    await userEvent.click(saveButton())

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledWith(rio))
  })

  it('blocks an unknown CEP', async () => {
    lookupCepMock.mockRejectedValue(new CepNotFoundError('99999999'))
    await open()

    await replace('CEP', '99999999')
    expect(await screen.findByText('CEP não encontrado.')).toBeInTheDocument()
    await userEvent.click(saveButton())

    expect(updateProfileMock).not.toHaveBeenCalled()
  })

  it('lets city and UF be typed when the CEP service is down', async () => {
    lookupCepMock.mockRejectedValue(new Error('Network Error'))
    await open()

    await replace('CEP', '20040002')
    expect(
      await screen.findByText('Não foi possível consultar o CEP. Preencha cidade e UF.'),
    ).toBeInTheDocument()
    await userEvent.type(field('Cidade'), 'Rio de Janeiro')
    await userEvent.type(field('UF'), 'rj')
    await userEvent.click(saveButton())

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledWith(rio))
  })

  it.each([
    ['Nome', '', 'Informe seu nome.'],
    ['Nome', 'A', 'Informe seu nome completo.'],
    ['Data de nascimento', '2020-01-01', 'Você precisa ter pelo menos 18 anos.'],
    ['CEP', '0100', 'O CEP deve ter 8 dígitos.'],
  ])('validates %s = "%s" before calling the API', async (label, value, message) => {
    await open()

    await replace(label, value)
    await userEvent.click(saveButton())

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(updateProfileMock).not.toHaveBeenCalled()
  })

  it('shows the API error and keeps the typed data', async () => {
    updateProfileMock.mockRejectedValue(new ApiError(400, ['name must be longer']))
    await open()

    await replace('Nome', 'Ana Lima')
    await userEvent.click(saveButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Confira os dados informados.')
    expect(field('Nome')).toHaveValue('Ana Lima')
    expect(screen.getByRole('button', { name: 'Menu da conta de Ana Souza' })).toBeInTheDocument()
  })

  it('redirects signed-out visitors to /login and back here afterwards', async () => {
    fetchMeMock.mockRejectedValue(new ApiError(401, ['Unauthorized']))

    const { router } = await renderRoute('/settings/profile')

    expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toEqual({ redirect: '/settings/profile' })
    expect(screen.queryByRole('heading', { name: 'Editar perfil' })).not.toBeInTheDocument()
    expect(fetchProfileMock).not.toHaveBeenCalled()
  })
})
