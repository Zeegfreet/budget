import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders title, description and action', () => {
    render(
      <EmptyState
        title="Nada aqui"
        description="Crie o primeiro item"
        action={<button>Criar</button>}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Nada aqui' })).toBeInTheDocument()
    expect(screen.getByText('Crie o primeiro item')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar' })).toBeInTheDocument()
  })
})
