import { describe, expect, it } from 'vitest'
import { getInitials } from './initials'

describe('getInitials', () => {
  it.each([
    ['Ana Souza', 'AS'],
    ['Ana Maria Souza', 'AS'],
    ['ana', 'A'],
    ['  joão   da  silva ', 'JS'],
    ['Élida Ávila', 'ÉÁ'],
    ['', ''],
    ['   ', ''],
  ])('%j → %j', (name, expected) => {
    expect(getInitials(name)).toBe(expected)
  })
})
