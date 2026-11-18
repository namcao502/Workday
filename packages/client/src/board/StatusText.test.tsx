import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { StatusText, statusColor } from './StatusText.js'

afterEach(() => {
  cleanup()
})

it('statusColor follows the Jira status category', () => {
  expect(statusColor('new')).toBe('text-muted')
  expect(statusColor('indeterminate')).toBe('text-accent')
  expect(statusColor('Done')).toBe('text-success')
  expect(statusColor(null)).toBe('')
})

it('StatusText colors the status name', () => {
  render(<StatusText status="PR & Code Review" statusCategory="indeterminate" />)
  expect(screen.getByText('PR & Code Review')).toHaveClass('text-accent')
})
