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

it('Segmented fades the right edge while choices are hidden past it', () => {
  const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(400)
  const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
  render(<Segmented label="Wide" value="a" options={options} onChange={vi.fn()} />)
  const group = screen.getByRole('radiogroup', { name: 'Wide' })
  expect(group).toHaveAttribute('data-overflow', 'true')
  expect(group.className).toContain('to_left')
  scrollWidth.mockRestore()
  clientWidth.mockRestore()
})

it('Segmented has no fade when every choice fits', () => {
  render(<Segmented label="Fits" value="a" options={options} onChange={vi.fn()} />)
  const group = screen.getByRole('radiogroup', { name: 'Fits' })
  expect(group).not.toHaveAttribute('data-overflow')
  expect(group.className).not.toContain('mask-image')
})
