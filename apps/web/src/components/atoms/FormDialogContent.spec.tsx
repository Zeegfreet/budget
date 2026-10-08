import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import { FormDialogContent } from './FormDialogContent'

function renderDialog(size?: 'sm' | 'md') {
  render(
    <Dialog open>
      <FormDialogContent size={size} aria-describedby={undefined}>
        <DialogTitle>Formulário</DialogTitle>
      </FormDialogContent>
    </Dialog>,
  )
  return screen.getByRole('dialog', { name: 'Formulário' })
}

describe('FormDialogContent', () => {
  it('keeps the content inside the box and scrolls when taller than the screen', () => {
    const dialog = renderDialog()

    expect(dialog).toHaveClass('grid-cols-[minmax(0,1fr)]', 'overflow-y-auto', 'max-h-[calc(100dvh-2rem)]')
    expect(dialog).toHaveClass('sm:max-w-sm')
    expect(dialog).toHaveAttribute('data-size', 'sm')
  })

  it('is wider with the md size', () => {
    const dialog = renderDialog('md')

    expect(dialog).toHaveClass('sm:max-w-md')
    expect(dialog).not.toHaveClass('sm:max-w-sm')
  })
})
