import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lookupCep } from '@/features/address/api'
import {
  activate,
  completeSignup,
  fetchActivation,
  fetchMe,
  resendActivation,
} from '@/features/auth/api'
import {
  activationSentMessage,
  invalidActivationLinkMessage,
  invalidRegisterDataMessage,
} from '@/features/auth/errors'
import { ApiError } from '@/lib/api/client'
import { makeAuthUser } from '@/test/auth'
import { stubBudgetApi } from '@/test/budget'
import { stubGroupsApi } from '@/test/groups'
import { renderRoute } from '@/test/render'

// Activating lands on the dashboard (sign-up) or the groups (pre-registration)
vi.mock('@/features/budget/api')
vi.mock('@/features/groups/api')
vi.mock('@/features/auth/api', () => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  fetchActivation: vi.fn(),
  activate: vi.fn(),
  completeSignup: vi.fn(),
  resendActivation: vi.fn(),
}))
vi.mock('@/features/address/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/address/api')>()),
  lookupCep: vi.fn(),
}))

const TOKEN = 'a'.repeat(43)
const ana = makeAuthUser()
const diego = makeAuthUser({ id: 9, name: 'Diego Alves', email: 'diego@example.com' })

const field = (label: string) => screen.getByLabelText(label)
const activateButton = () => screen.getByRole('button', { name: 'Ativar minha conta' })

describe('Activation route (/ativar-conta)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    stubBudgetApi()
    stubGroupsApi()
    vi.mocked(fetchMe).mockRejectedValue(new ApiError(401, ['Unauthorized']))
    vi.mocked(lookupCep).mockResolvedValue({ cep: '01001000', city: 'São Paulo', state: 'SP' })
  })

  describe('sign-up link', () => {
    beforeEach(() => {
      vi.mocked(fetchActivation).mockResolvedValue({
        email: 'ana@example.com',
        name: 'Ana Souza',
        kind: 'ACTIVATE',
      })
    })

    it('asks for a click (never activates on load), then opens the dashboard signed in', async () => {
      vi.mocked(activate).mockResolvedValue(ana)
      const { router } = await renderRoute(`/ativar-conta?token=${TOKEN}`)

      expect(await screen.findByRole('heading', { name: 'Ativar sua conta' })).toBeInTheDocument()
      expect(screen.getByText('ana@example.com')).toBeInTheDocument()
      expect(fetchActivation).toHaveBeenCalledWith(TOKEN)
      expect(activate).not.toHaveBeenCalled()

      vi.mocked(fetchMe).mockResolvedValue(ana)
      await userEvent.click(activateButton())

      expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
      expect(activate).toHaveBeenCalledWith(TOKEN, expect.anything())
      expect(router.state.location.pathname).toBe('/')
    })

    it('explains a link used meanwhile', async () => {
      vi.mocked(activate).mockRejectedValue(new ApiError(404, ['Invalid or expired activation link']))
      await renderRoute(`/ativar-conta?token=${TOKEN}`)

      await userEvent.click(await screen.findByRole('button', { name: 'Ativar minha conta' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(invalidActivationLinkMessage)
    })
  })

  describe('pre-registration link', () => {
    beforeEach(() => {
      vi.mocked(fetchActivation).mockResolvedValue({
        email: 'diego@example.com',
        name: 'Didi',
        kind: 'COMPLETE_SIGNUP',
      })
    })

    async function openForm() {
      const result = await renderRoute(`/ativar-conta?token=${TOKEN}`)
      await screen.findByRole('heading', { name: 'Ative sua conta' })
      return result
    }

    async function fillForm() {
      await userEvent.clear(field('Nome'))
      await userEvent.type(field('Nome'), ' Diego Alves ')
      await userEvent.type(field('Senha'), 'segredo123')
      await userEvent.type(field('Confirmar senha'), 'segredo123')
      await userEvent.type(field('Data de nascimento'), '1990-05-20')
      await userEvent.type(field('CEP'), '01001000')
      await waitFor(() => expect(field('Cidade')).toHaveValue('São Paulo'))
    }

    it('shows the e-mail read-only and the nickname as the name', async () => {
      await openForm()

      expect(field('E-mail')).toHaveValue('diego@example.com')
      expect(field('E-mail')).toBeDisabled()
      expect(field('Nome')).toHaveValue('Didi')
    })

    it('finishes the sign-up and opens the groups signed in', async () => {
      vi.mocked(completeSignup).mockResolvedValue(diego)
      const { router } = await openForm()

      await fillForm()
      vi.mocked(fetchMe).mockResolvedValue(diego)
      await userEvent.click(activateButton())

      await waitFor(() => expect(router.state.location.pathname).toBe('/grupos'))
      expect(completeSignup).toHaveBeenCalledWith(
        {
          token: TOKEN,
          name: 'Diego Alves',
          password: 'segredo123',
          birthDate: '1990-05-20',
          cep: '01001000',
          city: 'São Paulo',
          state: 'SP',
        },
        expect.anything(),
      )
      expect(await screen.findByRole('heading', { name: 'Grupos', level: 1 })).toBeInTheDocument()
    })

    it('validates every field without calling the API', async () => {
      await openForm()

      await userEvent.clear(field('Nome'))
      await userEvent.type(field('Senha'), 'curta')
      await userEvent.type(field('Confirmar senha'), 'outra')
      await userEvent.click(activateButton())

      expect(screen.getByText('Informe seu nome.')).toBeInTheDocument()
      expect(screen.getByText('Use pelo menos 8 caracteres.')).toBeInTheDocument()
      expect(screen.getByText('As senhas não coincidem.')).toBeInTheDocument()
      expect(screen.getByText('Informe sua data de nascimento.')).toBeInTheDocument()
      expect(screen.getByText('Informe seu CEP.')).toBeInTheDocument()
      expect(completeSignup).not.toHaveBeenCalled()
    })

    it('explains a refused sign-up and clears the passwords', async () => {
      vi.mocked(completeSignup).mockRejectedValue(new ApiError(400, ['cep must have exactly 8 digits']))
      await openForm()

      await fillForm()
      await userEvent.click(activateButton())

      expect(await screen.findByRole('alert')).toHaveTextContent(invalidRegisterDataMessage)
      expect(field('Senha')).toHaveValue('')
      expect(field('Confirmar senha')).toHaveValue('')
    })
  })

  describe('invalid link', () => {
    it('explains it and sends a new link to the typed e-mail', async () => {
      vi.mocked(fetchActivation).mockRejectedValue(new ApiError(404, ['Invalid or expired activation link']))
      vi.mocked(resendActivation).mockResolvedValue()
      await renderRoute(`/ativar-conta?token=${TOKEN}`)

      expect(await screen.findByRole('alert')).toHaveTextContent(invalidActivationLinkMessage)
      await userEvent.type(field('E-mail'), 'ana@example.com')
      await userEvent.click(screen.getByRole('button', { name: 'Enviar novo link' }))

      expect(await screen.findByRole('status')).toHaveTextContent(activationSentMessage)
      expect(resendActivation).toHaveBeenCalledWith('ana@example.com', expect.anything())
    })

    it('treats a page without token as an invalid link, without calling the API', async () => {
      await renderRoute('/ativar-conta')

      expect(screen.getByRole('alert')).toHaveTextContent(invalidActivationLinkMessage)
      expect(fetchActivation).not.toHaveBeenCalled()
    })
  })
})
