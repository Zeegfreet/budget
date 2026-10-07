import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FormAlert } from './FormAlert'

describe('FormAlert', () => {
  it('renders its content as an alert', () => {
    render(<FormAlert>Algo deu errado</FormAlert>)

    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado')
  })
})
