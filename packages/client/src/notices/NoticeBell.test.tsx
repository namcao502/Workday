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
