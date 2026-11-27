import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { trackAction } from '../api/pendingActions.js'
import { NoticeBell } from './NoticeBell.js'
import { suggestion, workView } from '../board/workTestSupport.js'
import { notice, renderNotices } from './noticeTestSupport.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('bell shows the unread count and Mark all read clears it', async () => {
  renderNotices(<NoticeBell />, [notice(1), notice(2), notice(3, { read: true })])
  expect(await screen.findByTestId('notice-unread')).toHaveTextContent('2')
  fireEvent.click(screen.getByRole('button', { name: /Notices/ }))
  expect(screen.getByText('MDP-3 moved to Ready to Test.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
  await waitFor(() => {
    expect(screen.queryByTestId('notice-unread')).toBeNull()
  })
})

it('the bell opens a popover listing notices newest first', async () => {
  renderNotices(<NoticeBell />, [notice(1), notice(2), notice(3)])
  fireEvent.click(await screen.findByRole('button', { name: /Notices/ }))
  const items = await screen.findAllByText(/moved to Ready to Test/)
  expect(items.map((item) => item.textContent)).toEqual([
    'MDP-3 moved to Ready to Test.',
    'MDP-2 moved to Ready to Test.',
    'MDP-1 moved to Ready to Test.',
  ])
})

it('opening a notice from the bell navigates and marks it read', async () => {
  const harness = renderNotices(<NoticeBell />, [
    notice(1, { target: { kind: 'workspace', tab: 'MDP-1', session: 'MDP-1~1' } }),
  ])
  fireEvent.click(await screen.findByRole('button', { name: /Notices/ }))
  fireEvent.click(await screen.findByText('MDP-1 moved to Ready to Test.'))
  expect(window.location.hash).toBe('#/workspace/MDP-1/MDP-1~1')
  await waitFor(() => {
    expect(harness.fetchMock).toHaveBeenCalledWith(
      '/api/notices/1/read',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

it('while work runs the bell icon turns into the spinner, as in the WPF app', async () => {
  renderNotices(<NoticeBell />, [])
  const bell = await screen.findByRole('button', { name: 'Notices' })
  let finish: () => void = () => undefined
  const action = trackAction(
    '/api/board/check',
    () => new Promise<void>((resolve) => (finish = resolve)),
  )
  expect(
    await screen.findByRole('button', { name: 'Notices, work running' }, { timeout: 2000 }),
  ).toBe(bell)
  expect(bell.querySelector('.spinner')).not.toBeNull()
  finish()
  await act(() => action)
  expect(await screen.findByRole('button', { name: 'Notices' }, { timeout: 2000 })).toBe(bell)
})

it('the open bell lists the running work by name above the notices', async () => {
  renderNotices(<NoticeBell />, [notice(1)])
  let finish: () => void = () => undefined
  const action = trackAction(
    '/api/workspace/start/MDP-7',
    () => new Promise<void>((resolve) => (finish = resolve)),
  )
  fireEvent.click(await screen.findByRole('button', { name: /Notices/ }))
  expect(await screen.findByText('Running now')).toBeInTheDocument()
  expect(screen.getByText('Creating the MDP-7 worktree')).toBeInTheDocument()
  finish()
  await act(() => action)
  await waitFor(() => {
    expect(screen.queryByText('Running now')).toBeNull()
  })
})

it('an urgent-ticket notice says which keys are no longer available to take', async () => {
  const urgent = notice(1, {
    topic: 'suggestions',
    event: { type: 'suggestionsUrgent', keys: ['MDP-10', 'MDP-11'] },
    target: { kind: 'board', key: null },
  })
  const work = workView({ suggestions: { epicKey: 'MDP-1', items: [suggestion('MDP-11')] } })
  renderNotices(<NoticeBell />, [urgent], {}, work)
  fireEvent.click(await screen.findByRole('button', { name: /Notices/ }))
  expect(await screen.findByText('No longer available to take: MDP-10')).toBeInTheDocument()
})
