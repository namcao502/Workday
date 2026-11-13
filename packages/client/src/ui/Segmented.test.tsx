import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Segmented } from './Segmented.js'

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta', dot: true },
] as const

it('Segmented exposes a radiogroup and reports the picked value', () => {
  const onChange = vi.fn()
  render(<Segmented label="View" value="a" options={options} onChange={onChange} />)
  expect(screen.getByRole('radiogroup', { name: 'View' })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(screen.getByRole('radio', { name: 'Beta' }))
  expect(onChange).toHaveBeenCalledWith('b')
})

it('Segmented shows the dot only on the flagged option', () => {
  render(<Segmented label="View" value="a" options={options} onChange={vi.fn()} />)
  const dots = screen.getAllByTestId('view-dot')
  expect(dots).toHaveLength(1)
  expect(screen.getByRole('radio', { name: 'Beta' })).toContainElement(dots[0] as HTMLElement)
})
