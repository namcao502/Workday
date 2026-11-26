import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { shuffledSeason } from '@workday/core'
import { jsonResponse, renderWithQuery, sentJson, settingsView, stubFetch } from '../testSupport.js'
import { GeneralSection, seasonName } from './GeneralSection.js'

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

it('on "Shuffle" it names the season showing this hour', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const now = new Date('2026-12-20T03:10:00Z')
  vi.setSystemTime(now)
  const base = settingsView()
  const settings = { ...base, config: { ...base.config, season: 'shuffle' as const } }
  stubFetch(() => jsonResponse(settings))
  renderWithQuery(<GeneralSection settings={settings} />)
  expect(screen.getByRole('radio', { name: 'Shuffle' })).toHaveAttribute('aria-checked', 'true')
  const season = shuffledSeason(Math.floor(now.getTime() / 3_600_000))
  expect(screen.getByTestId('season-now')).toHaveTextContent(`Now: ${seasonName(season)}`)
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

it('the effect level saves, and is hidden while seasons are off', async () => {
  const fetchMock = stubFetch(() => jsonResponse(settingsView()))
  const { unmount } = renderWithQuery(<GeneralSection settings={settingsView()} />)
  const effects = screen.getByRole('radiogroup', { name: 'Effects' })
  fireEvent.click(within(effects).getByRole('radio', { name: 'Light' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  expect(sentJson(fetchMock)).toEqual({ seasonEffects: 'light' })
  unmount()

  const off = settingsView()
  renderWithQuery(
    <GeneralSection settings={{ ...off, config: { ...off.config, season: 'off' } }} />,
  )
  expect(screen.queryByRole('radiogroup', { name: 'Effects' })).toBeNull()
})

it('the season cursor switch saves, and is hidden while seasons are off', async () => {
  const fetchMock = stubFetch(() => jsonResponse(settingsView()))
  const { unmount } = renderWithQuery(<GeneralSection settings={settingsView()} />)
  const cursor = screen.getByRole('radiogroup', { name: 'Cursor' })
  fireEvent.click(within(cursor).getByRole('radio', { name: 'Off' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  expect(sentJson(fetchMock)).toEqual({ seasonCursor: false })
  unmount()

  const off = settingsView()
  renderWithQuery(
    <GeneralSection settings={{ ...off, config: { ...off.config, season: 'off' } }} />,
  )
  expect(screen.queryByRole('radiogroup', { name: 'Cursor' })).toBeNull()
})
