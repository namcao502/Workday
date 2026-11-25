import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { holidayLabel, HolidaysSection } from './HolidaysSection.js'
import { jsonResponse, renderWithQuery, sentJson, settingsView, stubFetch } from '../testSupport.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('labels a yearly entry and a one-off date', () => {
  expect(holidayLabel('04-30')).toBe('30/04 every year')
  expect(holidayLabel('2027-02-08')).toBe('08/02/2027')
})

it('removing a holiday saves the rest of the list', async () => {
  const fetchMock = stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<HolidaysSection settings={settingsView()} />)

  fireEvent.click(screen.getByRole('button', { name: 'Remove 30/04 every year' }))

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  expect(sentJson(fetchMock)).toEqual({ holidays: ['01-01', '05-01', '09-02', '11-24'] })
  expect(screen.queryByText('30/04 every year')).toBeNull()
})

it('adds the picked date as a one-off, or as month-day when every year is on', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2027-02-08T03:00:00Z'))
  const fetchMock = stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<HolidaysSection settings={settingsView()} />)

  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  expect(sentJson(fetchMock)).toEqual({
    holidays: ['01-01', '04-30', '05-01', '09-02', '11-24', '2027-02-08'],
  })

  fireEvent.click(screen.getByRole('switch', { name: 'Every year' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
    holidays: ['01-01', '02-08', '04-30', '05-01', '09-02', '11-24', '2027-02-08'],
  })
  vi.useRealTimers()
})
