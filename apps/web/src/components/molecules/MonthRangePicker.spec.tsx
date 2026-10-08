import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonthRangePicker } from './MonthRangePicker'

const trigger = () => screen.getByRole('button', { name: /^Período:/ })
const month = (name: string) => screen.getByRole('button', { name })

function renderPicker(from = '2026-10', to = '2027-09') {
  const onChange = vi.fn()
  render(<MonthRangePicker from={from} to={to} onChange={onChange} />)
  return onChange
}

describe('MonthRangePicker', () => {
  beforeEach(() => {
    // Only the date: real timers keep user-event and Radix working
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12) })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the period on a button', () => {
    renderPicker()
    expect(trigger()).toHaveAccessibleName('Período: outubro de 2026 a setembro de 2027')
    expect(trigger()).toHaveTextContent('out/26 – set/27')
  })

  it('opens on the years of the period with its months marked', async () => {
    renderPicker()
    await userEvent.click(trigger())

    expect(screen.getByRole('group', { name: '2026' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '2027' })).toBeInTheDocument()
    expect(month('outubro de 2026')).toHaveAttribute('aria-pressed', 'true')
    expect(month('março de 2027')).toHaveAttribute('aria-pressed', 'true')
    expect(month('setembro de 2026')).toHaveAttribute('aria-pressed', 'false')
    expect(month('outubro de 2027')).toHaveAttribute('aria-pressed', 'false')
  })

  it('picks a period with two clicks, in either order', async () => {
    const onChange = renderPicker()
    await userEvent.click(trigger())
    await userEvent.click(month('março de 2027'))
    expect(screen.getByText('Agora o último mês (até 24 meses)')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()

    await userEvent.click(month('novembro de 2026'))
    expect(onChange).toHaveBeenCalledWith({ from: '2026-11', to: '2027-03' })
    // Applied and closed
    expect(screen.queryByRole('group', { name: '2026' })).not.toBeInTheDocument()
  })

  it('takes a single month period', async () => {
    const onChange = renderPicker()
    await userEvent.click(trigger())
    await userEvent.click(month('dezembro de 2026'))
    await userEvent.click(month('dezembro de 2026'))
    expect(onChange).toHaveBeenCalledWith({ from: '2026-12', to: '2026-12' })
  })

  it('reaches at most 24 months from the first click, across years', async () => {
    const onChange = renderPicker()
    await userEvent.click(trigger())
    await userEvent.click(month('outubro de 2026'))

    await userEvent.click(screen.getByRole('button', { name: 'Próximo ano' }))
    await userEvent.click(screen.getByRole('button', { name: 'Próximo ano' }))
    expect(screen.getByRole('group', { name: '2028' })).toBeInTheDocument()
    expect(month('setembro de 2028')).toBeEnabled()
    expect(month('outubro de 2028')).toBeDisabled()

    await userEvent.click(month('setembro de 2028'))
    expect(onChange).toHaveBeenCalledWith({ from: '2026-10', to: '2028-09' })
  })

  it('goes back in years', async () => {
    renderPicker()
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('button', { name: 'Ano anterior' }))
    expect(screen.getByRole('group', { name: '2025' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '2027' })).not.toBeInTheDocument()
  })

  it('drops a half-picked period when closed', async () => {
    const onChange = renderPicker()
    await userEvent.click(trigger())
    await userEvent.click(month('janeiro de 2027'))
    await userEvent.keyboard('{Escape}')
    expect(onChange).not.toHaveBeenCalled()

    await userEvent.click(trigger())
    expect(screen.getByText('Escolha o primeiro mês do período')).toBeInTheDocument()
    expect(month('outubro de 2026')).toHaveAttribute('aria-pressed', 'true')
  })

  it.each([
    ['Próximos 12 meses', { from: '2026-10', to: '2027-09' }],
    ['Últimos 12 meses', { from: '2025-11', to: '2026-10' }],
    ['Ano atual', { from: '2026-01', to: '2026-12' }],
  ])('applies the "%s" shortcut', async (name, range) => {
    const onChange = renderPicker('2026-11', '2026-12')
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('button', { name }))
    expect(onChange).toHaveBeenCalledWith(range)
  })

  it('resets to the default period, disabled when already there', async () => {
    const onChange = renderPicker('2026-11', '2026-12')
    const group = screen.getByRole('group', { name: 'Período' })
    await userEvent.click(within(group).getByRole('button', { name: 'Redefinir período' }))
    expect(onChange).toHaveBeenCalledWith({ from: '2026-10', to: '2027-09' })
  })

  it('has nothing to reset on the default period', () => {
    renderPicker()
    expect(screen.getByRole('button', { name: 'Redefinir período' })).toBeDisabled()
  })
})
