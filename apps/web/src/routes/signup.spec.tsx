import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CepNotFoundError, lookupCep } from '@/features/address/api'
import { fetchMe, register } from '@/features/auth/api'
import {
  emailTakenMessage,
  serverUnavailableMessage,
  tooManyAttemptsMessage,
} from '@/features/auth/errors'
import { ApiError } from '@/lib/api/client'
import { renderRoute } from '@/test/render'

vi.mock('@/features/auth/api', () => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}))
vi.mock('@/features/address/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/address/api')>()),
  lookupCep: vi.fn(),
}))

const fetchMeMock = vi.mocked(fetchMe)
const registerMock = vi.mocked(register)
const lookupCepMock = vi.mocked(lookupCep)

const ana = { id: 1, name: 'Ana Souza', email: 'ana@example.com' }
const saoPaulo = { cep: '01001000', city: 'São Paulo', state: 'SP' }

const field = (label: string) => screen.getByLabelText(label)
const submit = () => userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))

interface FillOptions {
  name?: string
  email?: string
  password?: string
  passwordConfirmation?: string
  birthDate?: string
  cep?: string
}

async function fill({
  name = 'Ana Souza',
  email = 'ana@example.com',
  password = 'segredo123',
  passwordConfirmation = password,
  birthDate = '1990-05-20',
  cep = '01001000',
}: FillOptions = {}) {
  if (name) await userEvent.type(field('Nome'), name)
  if (email) await userEvent.type(field('E-mail'), email)
  if (password) await userEvent.type(field('Senha'), password)
  if (passwordConfirmation) await userEvent.type(field('Confirmar senha'), passwordConfirmation)
  if (birthDate) await userEvent.type(field('Data de nascimento'), birthDate)
  if (cep) await userEvent.type(field('CEP'), cep)
}

async function fillValidForm(options?: FillOptions) {
  await fill(options)
  await waitFor(() => expect(field('Cidade')).toHaveValue('São Paulo'))
}

describe('Sign-up route (/signup)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fetchMeMock.mockRejectedValue(new ApiError(401, ['Unauthorized']))
    lookupCepMock.mockResolvedValue(saoPaulo)
  })

  describe('layout', () => {
    it('renders every field with the right input types, without the app header', async () => {
      await renderRoute('/signup')

      expect(screen.getByRole('heading', { name: 'Criar conta no Budget' })).toBeInTheDocument()
      expect(field('Nome')).toHaveAttribute('autocomplete', 'name')
      expect(field('E-mail')).toHaveAttribute('type', 'email')
      expect(field('Senha')).toHaveAttribute('type', 'password')
      expect(field('Senha')).toHaveAttribute('autocomplete', 'new-password')
      expect(field('Confirmar senha')).toHaveAttribute('type', 'password')
      expect(field('Data de nascimento')).toHaveAttribute('type', 'date')
      expect(field('CEP')).toHaveAttribute('inputmode', 'numeric')
      expect(field('Cidade')).toHaveAttribute('readonly')
      expect(field('UF')).toHaveAttribute('readonly')
      expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('offers OAuth sign-up and a link back to the login page', async () => {
      const { router } = await renderRoute('/signup?redirect=%2Fgroups')

      expect(screen.getByRole('link', { name: 'Continuar com GitHub' })).toHaveAttribute(
        'href',
        '/api/auth/github',
      )
      expect(screen.getByRole('link', { name: 'Continuar com Google (Gmail)' })).toBeInTheDocument()

      await userEvent.click(screen.getByRole('link', { name: 'Entrar' }))

      expect(await screen.findByRole('heading', { name: 'Entrar no Budget' })).toBeInTheDocument()
      expect(router.state.location.href).toBe('/login?redirect=%2Fgroups')
    })

    it('is reachable from the login page', async () => {
      const { router } = await renderRoute('/login')

      await userEvent.click(screen.getByRole('link', { name: 'Criar conta' }))

      expect(await screen.findByRole('heading', { name: 'Criar conta no Budget' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/signup')
    })
  })

  describe('validation', () => {
    it('requires every field without calling the API', async () => {
      await renderRoute('/signup')

      await submit()

      for (const message of [
        'Informe seu nome.',
        'Informe seu e-mail.',
        'Crie uma senha.',
        'Confirme sua senha.',
        'Informe sua data de nascimento.',
        'Informe seu CEP.',
        'Informe sua cidade.',
        'Informe a UF.',
      ]) {
        expect(screen.getByText(message)).toBeInTheDocument()
      }
      expect(field('Nome')).toHaveAttribute('aria-invalid', 'true')
      expect(registerMock).not.toHaveBeenCalled()
      expect(lookupCepMock).not.toHaveBeenCalled()
    })

    it.each([
      [{ email: 'ana@' }, 'Informe um e-mail válido.'],
      [{ password: 'curta', passwordConfirmation: 'curta' }, 'Use pelo menos 8 caracteres.'],
      [{ passwordConfirmation: 'outra1234' }, 'As senhas não coincidem.'],
      [{ birthDate: '2015-01-01' }, 'Você precisa ter pelo menos 18 anos.'],
      [{ birthDate: '2999-01-01' }, 'A data não pode estar no futuro.'],
    ])('rejects %o', async (overrides, message) => {
      await renderRoute('/signup')

      await fillValidForm(overrides)
      await submit()

      expect(screen.getByText(message)).toBeInTheDocument()
      expect(registerMock).not.toHaveBeenCalled()
    })
  })

  describe('CEP lookup', () => {
    it('masks the CEP and fills city and UF from it', async () => {
      await renderRoute('/signup')

      await userEvent.type(field('CEP'), '01001000')

      expect(field('CEP')).toHaveValue('01001-000')
      expect(lookupCepMock).toHaveBeenCalledWith('01001000')
      await waitFor(() => expect(field('Cidade')).toHaveValue('São Paulo'))
      expect(field('UF')).toHaveValue('SP')
      expect(field('Cidade')).toHaveAttribute('readonly')
    })

    it('shows a lookup hint while searching', async () => {
      lookupCepMock.mockReturnValue(new Promise(() => {}))
      await renderRoute('/signup')

      await userEvent.type(field('CEP'), '01001000')

      expect(await screen.findByText('Buscando endereço…')).toBeInTheDocument()
    })

    it('flags an unknown CEP and blocks the submit', async () => {
      lookupCepMock.mockRejectedValue(new CepNotFoundError('99999999'))
      await renderRoute('/signup')

      await fill({ cep: '99999999' })

      expect(await screen.findByText('CEP não encontrado.')).toBeInTheDocument()
      expect(field('CEP')).toHaveAttribute('aria-invalid', 'true')
      expect(field('Cidade')).toHaveValue('')

      await submit()

      expect(registerMock).not.toHaveBeenCalled()
    })

    it('lets the user type city and UF when the lookup service is down', async () => {
      lookupCepMock.mockRejectedValue(new Error('Network Error'))
      registerMock.mockResolvedValue(ana)
      await renderRoute('/signup')

      await fill()
      expect(
        await screen.findByText('Não foi possível consultar o CEP. Preencha cidade e UF.'),
      ).toBeInTheDocument()
      expect(field('Cidade')).not.toHaveAttribute('readonly')

      await userEvent.type(field('Cidade'), 'Campinas')
      await userEvent.type(field('UF'), 'xx')
      await submit()

      expect(field('UF')).toHaveValue('XX')
      expect(screen.getByText('UF inválida.')).toBeInTheDocument()
      expect(registerMock).not.toHaveBeenCalled()

      await userEvent.clear(field('UF'))
      await userEvent.type(field('UF'), 'sp')
      await submit()

      await waitFor(() =>
        expect(registerMock).toHaveBeenCalledWith(
          expect.objectContaining({ cep: '01001000', city: 'Campinas', state: 'SP' }),
          expect.anything(),
        ),
      )
    })
  })

  describe('sign-up', () => {
    it('sends the normalized data and goes to the home page signed in', async () => {
      registerMock.mockResolvedValue(ana)
      const { router } = await renderRoute('/signup')

      await fillValidForm({ name: '  Ana Souza ', email: ' ana@example.com  ' })
      await submit()

      expect(registerMock).toHaveBeenCalledWith(
        {
          name: 'Ana Souza',
          email: 'ana@example.com',
          password: 'segredo123',
          birthDate: '1990-05-20',
          cep: '01001000',
          city: 'São Paulo',
          state: 'SP',
        },
        expect.anything(),
      )
      expect(await screen.findByRole('heading', { name: 'Olá, Ana!' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/')
      expect(screen.getByRole('button', { name: /menu da conta/i })).toHaveTextContent('ana@example.com')
    })

    it('returns to the internal page in ?redirect', async () => {
      registerMock.mockResolvedValue(ana)
      const { router } = await renderRoute('/signup?redirect=%2F%3Ftab%3Dgroups')

      await fillValidForm()
      await submit()

      await waitFor(() => expect(router.state.location.href).toBe('/?tab=groups'))
    })

    it('ignores an external ?redirect (open redirect)', async () => {
      registerMock.mockResolvedValue(ana)
      const { router } = await renderRoute('/signup?redirect=%2F%2Fevil.com')

      await fillValidForm()
      await submit()

      expect(await screen.findByRole('heading', { name: 'Olá, Ana!' })).toBeInTheDocument()
      expect(router.state.location.href).toBe('/')
    })

    it('disables the submit button while creating the account', async () => {
      registerMock.mockReturnValue(new Promise(() => {}))
      await renderRoute('/signup')

      await fillValidForm()
      await submit()

      expect(screen.getByRole('button', { name: /Criar conta/ })).toBeDisabled()
      expect(screen.getByRole('status', { name: 'Criando conta' })).toBeInTheDocument()
    })
  })

  describe('failures', () => {
    it('explains a taken e-mail, links to the login page and clears the passwords', async () => {
      registerMock.mockRejectedValue(new ApiError(409, ['Email already registered']))
      await renderRoute('/signup')

      await fillValidForm()
      await submit()

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(emailTakenMessage)
      expect(alert.querySelector('a')).toHaveAttribute('href', '/login')
      expect(field('Senha')).toHaveValue('')
      expect(field('Confirmar senha')).toHaveValue('')
      expect(field('Senha')).toHaveFocus()
      expect(field('E-mail')).toHaveValue('ana@example.com')
    })

    it.each([
      [new ApiError(429, ['Too Many Requests']), tooManyAttemptsMessage],
      [new ApiError(0, ['Network Error']), serverUnavailableMessage],
    ])('shows a message for %o', async (error, message) => {
      registerMock.mockRejectedValue(error)
      await renderRoute('/signup')

      await fillValidForm()
      await submit()

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(screen.getByRole('alert').querySelector('a')).toBeNull()
    })
  })

  it('sends an already signed-in user to the home page', async () => {
    fetchMeMock.mockResolvedValue(ana)
    const { router } = await renderRoute('/signup')

    expect(await screen.findByRole('heading', { name: 'Olá, Ana!' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})
