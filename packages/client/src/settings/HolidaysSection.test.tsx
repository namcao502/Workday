import type { SettingsView } from '@workday/core'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { holidayDateLabel, HolidaysSection } from './HolidaysSection.js'
import { jsonResponse, renderWithQuery, sentJson, settingsView, stubFetch } from '../testSupport.js'

const LIST = [
  { date: '04-30', name: null },
  { date: '2027-02-08', name: 'Tet' },
]

function withHolidays(): SettingsView {
  const view = settingsView()
  return { ...view, config: { ...view.config, holidays: LIST } }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('labels a yearly date and a one-off date', () => {
  expect(holidayDateLabel('04-30')).toBe('30/04 every year')
  expect(holidayDateLabel('2027-02-08')).toBe('08/02/2027')
})

it('shows each holiday by name and removing one saves the rest', async () => {
  const fetchMock = stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<HolidaysSection settings={withHolidays()} />)
  expect(screen.getByText('Reunification Day - 30/04 every year')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Remove Tet - 08/02/2027' }))

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  expect(sentJson(fetchMock)).toEqual({ holidays: [{ date: '04-30', name: null }] })
})

it('adds the picked date with its name, as month-day when every year is on', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2027-02-09T03:00:00Z'))
  const fetchMock = stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<HolidaysSection settings={withHolidays()} />)

  fireEvent.change(screen.getByRole('textbox', { name: 'Name (optional)' }), {
    target: { value: 'Tet day 2' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  expect(sentJson(fetchMock)).toEqual({
    holidays: [...LIST, { date: '2027-02-09', name: 'Tet day 2' }],
  })

  fireEvent.click(screen.getByRole('switch', { name: 'Every year' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
    holidays: [
      { date: '02-09', name: null },
      { date: '04-30', name: null },
      { date: '2027-02-08', name: 'Tet' },
      { date: '2027-02-09', name: 'Tet day 2' },
    ],
  })
})
