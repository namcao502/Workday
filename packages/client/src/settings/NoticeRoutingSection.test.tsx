import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NoticeRoutingSection } from './NoticeRoutingSection.js'
import { jsonResponse, renderWithQuery, sentJson, settingsView, stubFetch } from '../testSupport.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('saves the whole routing when a choice changes, and hides the minutes when off', async () => {
  const fetchMock = stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<NoticeRoutingSection settings={settingsView()} />)

  fireEvent.click(screen.getAllByRole('radio', { name: '10 min' })[0] as HTMLElement)
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  expect(sentJson(fetchMock)).toEqual({
    noticeRouting: { phoneOnlyWhenAway: true, idleMinutes: 10, fallbackMinutes: 5 },
  })

  fireEvent.click(screen.getByRole('switch', { name: /only when I am away/ }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  expect(screen.queryByText('Away after')).toBeNull()
})
