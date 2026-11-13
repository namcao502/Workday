import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NoticesSection } from './NoticesSection.js'
import { jsonResponse, renderWithQuery, sentJson, settingsView, stubFetch } from '../testSupport.js'

const pushMocks = vi.hoisted(() => ({
  localPushActive: vi.fn<() => Promise<boolean>>(),
  subscribeLocalPush: vi.fn<() => Promise<'subscribed' | 'denied'>>(),
  unsubscribeLocalPush: vi.fn<() => Promise<void>>(),
}))

vi.mock('../remote/pushSubscription.js', () => ({
  ...pushMocks,
  pushSupported: () => true,
}))

beforeEach(() => {
  pushMocks.localPushActive.mockResolvedValue(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('notices section saves only the channels that differ from the default', async () => {
  const fetchMock = stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<NoticesSection settings={settingsView()} />)
  // jira defaults: toast on, desktop off.
  fireEvent.click(screen.getByLabelText('Jira: Desktop'))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  expect(sentJson(fetchMock)).toEqual({ notices: { jira: { desktop: true } } })
  fireEvent.click(screen.getByLabelText('Jira: Desktop'))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({ notices: {} })
})

it('the closed-window button subscribes, and reports a denied permission', async () => {
  stubFetch(() => jsonResponse(settingsView()))
  pushMocks.subscribeLocalPush.mockResolvedValueOnce('subscribed').mockResolvedValueOnce('denied')
  renderWithQuery(<NoticesSection settings={settingsView()} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Notify even when Workday is closed' }))
  fireEvent.click(
    await screen.findByRole('button', { name: 'Stop notifying when Workday is closed' }),
  )
  await waitFor(() => {
    expect(pushMocks.unsubscribeLocalPush).toHaveBeenCalled()
  })
  fireEvent.click(await screen.findByRole('button', { name: 'Notify even when Workday is closed' }))

  expect(await screen.findByText(/blocked notifications/)).toBeInTheDocument()
})
