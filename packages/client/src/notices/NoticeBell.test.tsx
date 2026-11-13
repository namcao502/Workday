import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NoticeBell } from './NoticeBell.js'
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
