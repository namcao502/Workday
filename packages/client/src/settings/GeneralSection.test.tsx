import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, sentJson, settingsView, stubFetch } from '../testSupport.js'
import { GeneralSection } from './GeneralSection.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('on "By date" it names the season the date picks', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-12-20T03:00:00Z'))
  stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<GeneralSection settings={settingsView()} />)
  expect(screen.getByRole('radio', { name: 'By date' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByTestId('season-now')).toHaveTextContent('Now: Christmas')
})

it('picking a season by hand saves it', async () => {
  const fetchMock = stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<GeneralSection settings={settingsView()} />)
  fireEvent.click(screen.getByRole('radio', { name: 'Winter' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  expect(sentJson(fetchMock)).toEqual({ season: 'winter' })
})
