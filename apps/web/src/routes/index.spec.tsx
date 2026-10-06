import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchUsers } from '@/features/user/api'
import { ApiError } from '@/lib/api/client'
import { renderRoute } from '@/test/render'

vi.mock('@/features/user/api', () => ({ fetchUsers: vi.fn() }))

const fetchUsersMock = vi.mocked(fetchUsers)

describe('Home route (/)', () => {
  beforeEach(() => {
    fetchUsersMock.mockReset()
  })

  it('renders the app layout and the users list', async () => {
    fetchUsersMock.mockResolvedValue([
      { id: 1, name: 'Ana', email: 'ana@example.com' },
      { id: 2, name: null, email: 'bob@example.com' },
    ])

    await renderRoute('/')

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Bem-vindo ao Budget' })).toBeInTheDocument()
    expect(await screen.findByText('ana@example.com')).toBeInTheDocument()
    expect(screen.getByText('bob@example.com')).toBeInTheDocument()
  })

  it('shows an empty state when there are no users', async () => {
    fetchUsersMock.mockResolvedValue([])

    await renderRoute('/')

    expect(await screen.findByText('Nenhum usuário cadastrado')).toBeInTheDocument()
  })

  it('shows the API error message when the request fails', async () => {
    fetchUsersMock.mockRejectedValue(new ApiError(500, ['Internal server error']))

    await renderRoute('/')

    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error')
  })
})
