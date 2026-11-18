import { cleanup, render, screen } from '@testing-library/react'
import type { StatusFlow } from '@workday/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it } from 'vitest'
import { StatusText, statusColor } from './StatusText.js'

afterEach(() => {
  cleanup()
})

const FLOW: StatusFlow = {
  preWorkStatuses: ['Backlog', 'In Progress'],
  reworkStatuses: ['In Progress', 'QA Failed'],
  readyToTestPath: ['PR & Code Review', 'Ready to Test'],
  developerStatuses: [],
}

it('statusColor follows the Jira status category without a flow', () => {
  expect(statusColor('To Do', 'new', undefined)).toBe('text-muted')
  expect(statusColor('In Progress', 'indeterminate', undefined)).toBe('text-accent')
  expect(statusColor('Closed', 'Done', undefined)).toBe('text-success')
  expect(statusColor(null, null, undefined)).toBe('')
})

it('statusColor splits the in-progress category by the configured flow', () => {
  expect(statusColor('ready to test', 'indeterminate', FLOW)).toBe('text-success')
  expect(statusColor('PR & Code Review', 'indeterminate', FLOW)).toBe('text-foreground')
  expect(statusColor('QA Failed', 'indeterminate', FLOW)).toBe('text-warning')
  // Pre-work as well as rework: the developer's own status, not a send-back.
  expect(statusColor('In Progress', 'indeterminate', FLOW)).toBe('text-accent')
})

it('StatusText colors the status name', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StatusText status="In Progress" statusCategory="indeterminate" />
    </QueryClientProvider>,
  )
  expect(screen.getByText('In Progress')).toHaveClass('text-accent')
})
