import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NoticeToasts, TOAST_MS } from './NoticeToasts.js'
import { firstLoad, notice, renderNotices } from './noticeTestSupport.js'
import { useNotices } from './useNotices.js'

const localPushActive = vi.hoisted(() => vi.fn<() => Promise<boolean>>())

vi.mock('../remote/pushSubscription.js', () => ({
  localPushActive,
  LOCAL_PUSH_CHANGED_EVENT: 'workday:local-push-changed',
}))

function Harness(): React.JSX.Element {
  return <NoticeToasts alerts={useNotices('insights')} />
}

class FakeNotification {
  static permission = 'granted'
  static readonly shown: string[] = []
  onclick: (() => void) | null = null
  constructor(text: string) {
    FakeNotification.shown.push(text)
  }
}

beforeEach(() => {
  FakeNotification.shown.length = 0
  localPushActive.mockResolvedValue(false)
  vi.stubGlobal('Notification', FakeNotification)
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  window.location.hash = '#/insights'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('useNotices raises nothing for the notices of the first load', async () => {
  const harness = renderNotices(<Harness />, [notice(1), notice(2)])
  await firstLoad(harness)
  await act(() => harness.reload())
  expect(screen.queryByRole('button')).toBeNull()
  expect(FakeNotification.shown).toEqual([])
})

it('a new notice shows a toast and a desktop notification only on the channels its topic allows', async () => {
  const first = notice(1)
  const harness = renderNotices(<Harness />, [first])
  await firstLoad(harness)
  // jira: toast yes, desktop no. claude: both.
  harness.setView([
    first,
    notice(2),
    notice(3, {
      topic: 'claude',
      event: { type: 'claudeWait', subject: 'MDP-3', wait: 'finished' },
    }),
  ])
  await act(() => harness.reload())
  expect(await screen.findByText('MDP-2 moved to Ready to Test.')).toBeInTheDocument()
  expect(screen.getByText('MDP-3: Claude is done - your turn.')).toBeInTheDocument()
  expect(FakeNotification.shown).toEqual(['MDP-3: Claude is done - your turn.'])
})

it('clicking a toast navigates to its target and marks it read', async () => {
  const first = notice(1)
  const harness = renderNotices(<Harness />, [first])
  await firstLoad(harness)
  harness.setView([
    first,
    notice(2, { target: { kind: 'workspace', tab: 'MDP-2', session: 'MDP-2~1' } }),
  ])
  await act(() => harness.reload())
  fireEvent.click(await screen.findByText('MDP-2 moved to Ready to Test.'))
  expect(window.location.hash).toBe('#/workspace/MDP-2/MDP-2~1')
  await waitFor(() => {
    expect(harness.fetchMock).toHaveBeenCalledWith(
      '/api/notices/2/read',
      expect.objectContaining({ method: 'POST' }),
    )
  })
  expect(screen.queryByText('MDP-2 moved to Ready to Test.')).toBeNull()
})

it('no in-window desktop notification while local push is active', async () => {
  localPushActive.mockResolvedValue(true)
  const first = notice(1)
  const harness = renderNotices(<Harness />, [first])
  await firstLoad(harness)
  await waitFor(() => {
    expect(localPushActive).toHaveBeenCalled()
  })
  harness.setView([
    first,
    notice(2, {
      topic: 'claude',
      event: { type: 'claudeWait', subject: 'MDP-2', wait: 'finished' },
    }),
  ])
  await act(() => harness.reload())
  // The toast still shows; only the in-window desktop notification is left to the service worker.
  expect(await screen.findByText('MDP-2: Claude is done - your turn.')).toBeInTheDocument()
  expect(FakeNotification.shown).toEqual([])
})

async function showSecondToast(): Promise<ReturnType<typeof renderNotices>> {
  const first = notice(1)
  const harness = renderNotices(<Harness />, [first])
  await firstLoad(harness)
  harness.setView([first, notice(2)])
  await act(() => harness.reload())
  return harness
}

it('a toast closes itself after TOAST_MS without reading the notice', async () => {
  // shouldAdvanceTime keeps findBy/waitFor polling alive while the toast timer is fake.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    const harness = await showSecondToast()
    expect(await screen.findByText('MDP-2 moved to Ready to Test.')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(TOAST_MS)
    })
    expect(screen.queryByText('MDP-2 moved to Ready to Test.')).toBeNull()
    expect(harness.fetchMock).not.toHaveBeenCalledWith('/api/notices/2/read', expect.anything())
  } finally {
    vi.useRealTimers()
  }
})

it('the toast close button reads the notice', async () => {
  const harness = await showSecondToast()
  fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
  await waitFor(() => {
    expect(harness.fetchMock).toHaveBeenCalledWith(
      '/api/notices/2/read',
      expect.objectContaining({ method: 'POST' }),
    )
  })
  expect(screen.queryByText('MDP-2 moved to Ready to Test.')).toBeNull()
})
