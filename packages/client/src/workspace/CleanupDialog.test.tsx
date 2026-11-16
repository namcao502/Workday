import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { CleanupRow, CleanupView } from '@workday/core'
import { afterEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, stubFetch, type FetchMock } from '../testSupport.js'
import { CleanupDialog } from './CleanupDialog.js'

function row(overrides: Partial<CleanupRow>): CleanupRow {
  return {
    ticketKey: 'MDP-1',
    repositories: ['Portal'],
    verdict: 'ready',
    reasons: [],
    dirtyFiles: 0,
    slimBytes: 0,
    isMined: false,
    isMerged: true,
    ...overrides,
  }
}

function stubCleanup(rows: readonly CleanupRow[]): FetchMock {
  const view: CleanupView = { rows }
  return stubFetch((url, init) => {
    if (url === '/api/workspace/cleanup' && init?.method === 'GET') {
      return jsonResponse(view)
    }
    return jsonResponse({ ok: true })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it('CleanupDialog shows Remove only for ready and check rows', async () => {
  stubCleanup([
    row({ ticketKey: 'MDP-1', verdict: 'ready' }),
    row({ ticketKey: 'MDP-2', verdict: 'check', reasons: [{ code: 'dirty', count: 3 }] }),
    row({ ticketKey: 'MDP-3', verdict: 'keep', reasons: [{ code: 'notMerged' }] }),
    row({ ticketKey: 'MDP-4', verdict: 'noWorktree' }),
  ])
  renderWithQuery(<CleanupDialog onClose={vi.fn()} />)
  const first = await screen.findByTestId('cleanup-row-MDP-1')
  const hasRemove = (key: string): boolean =>
    within(screen.getByTestId(`cleanup-row-${key}`)).queryByRole('button', { name: 'Remove' }) !==
    null
  expect(within(first).getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  expect(hasRemove('MDP-2')).toBe(true)
  expect(hasRemove('MDP-3')).toBe(false)
  expect(hasRemove('MDP-4')).toBe(false)
})

it('CleanupDialog shows Slim only for noWorktree rows with slimBytes', async () => {
  stubCleanup([
    row({ ticketKey: 'MDP-1', verdict: 'noWorktree', slimBytes: 2 * 1024 * 1024 }),
    row({ ticketKey: 'MDP-2', verdict: 'noWorktree', slimBytes: 0 }),
    row({ ticketKey: 'MDP-3', verdict: 'ready', slimBytes: 1024 }),
  ])
  renderWithQuery(<CleanupDialog onClose={vi.fn()} />)
  const first = await screen.findByTestId('cleanup-row-MDP-1')
  const hasSlim = (key: string): boolean =>
    within(screen.getByTestId(`cleanup-row-${key}`)).queryByRole('button', {
      name: 'Slim docs',
    }) !== null
  expect(within(first).getByRole('button', { name: 'Slim docs' })).toBeInTheDocument()
  expect(hasSlim('MDP-2')).toBe(false)
  expect(hasSlim('MDP-3')).toBe(false)
})

it("CleanupDialog sends the row's dirtyFiles with Remove", async () => {
  const fetchMock = stubCleanup([row({ ticketKey: 'MDP-7', verdict: 'check', dirtyFiles: 4 })])
  renderWithQuery(<CleanupDialog onClose={vi.fn()} />)
  const target = await screen.findByTestId('cleanup-row-MDP-7')
  fireEvent.click(within(target).getByRole('button', { name: 'Remove' }))
  const confirm = await screen.findByRole('dialog', { name: 'Remove worktree' })
  expect(confirm).toHaveTextContent('4')
  fireEvent.click(within(confirm).getByRole('button', { name: 'Remove worktree' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/workspace/cleanup/MDP-7/remove',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ dirtyFiles: 4 }) }),
    )
  })
})

it('CleanupDialog shows a refusal on the row', async () => {
  stubFetch((url, init) => {
    if (init?.method === 'POST') {
      return jsonResponse({ ok: false, error: { code: 'stateChanged' } })
    }
    return jsonResponse({ rows: [row({ ticketKey: 'MDP-8' })] })
  })
  renderWithQuery(<CleanupDialog onClose={vi.fn()} />)
  const target = await screen.findByTestId('cleanup-row-MDP-8')
  fireEvent.click(within(target).getByRole('button', { name: 'Remove' }))
  const confirm = await screen.findByRole('dialog', { name: 'Remove worktree' })
  fireEvent.click(within(confirm).getByRole('button', { name: 'Remove worktree' }))
  expect(await within(target).findByText(/changed since the list was loaded/)).toBeInTheDocument()
})

it('CleanupDialog points to Settings when there is nothing to list', async () => {
  stubCleanup([])
  renderWithQuery(<CleanupDialog onClose={vi.fn()} />)
  expect(await screen.findByText(/Nothing to clean up/)).toBeInTheDocument()
})
