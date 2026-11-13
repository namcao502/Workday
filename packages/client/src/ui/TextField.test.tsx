import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { TextField } from './TextField.js'

it('TextField links the label, the input and the hint', () => {
  render(<TextField id="site" label="Site" hint="Your site URL" value="" onChange={vi.fn()} />)
  const input = screen.getByLabelText('Site')
  expect(input.tagName).toBe('INPUT')
  expect(input).toHaveAttribute('id', 'site')
  const hint = screen.getByText('Your site URL')
  expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(hint.id)
})
