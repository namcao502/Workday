import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { setLanguage } from '../i18n.js'
import { DateInput } from './DateInput.js'

afterEach(() => {
  cleanup()
  setLanguage('en')
})

// The typed segments in screen order, e.g. "18/11/2026".
function shownDate(): string {
  const group = screen.getAllByRole('group')[0]
  return (group?.textContent ?? '').replace(/\s/g, '').replace(/[^0-9/]/g, '')
}

function renderInput(): void {
  render(<DateInput label="Date" name="d" value="2026-11-18" onChange={() => undefined} />)
}

it('shows month first in English', () => {
  setLanguage('en')
  renderInput()
  expect(shownDate()).toBe('11/18/2026')
})

it('shows day first in Vietnamese', () => {
  setLanguage('vi')
  renderInput()
  expect(shownDate()).toBe('18/11/2026')
})
