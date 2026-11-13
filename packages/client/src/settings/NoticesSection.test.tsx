import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NoticesSection } from './NoticesSection.js'
import { jsonResponse, renderWithQuery, sentJson, settingsView, stubFetch } from '../testSupport.js'

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
