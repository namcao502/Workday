import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { SettingsView, TimesheetConfig } from '@workday/core'
import { afterEach, expect, it, vi } from 'vitest'
import { TimesheetSection } from './TimesheetSection.js'
import { jsonResponse, renderWithQuery, sentJson, settingsView, stubFetch } from '../testSupport.js'

const SAVED_TSC = {
  shareUrl: 'https://share.example.com/x',
  worksheetPattern: 'Daily Reports - {year}',
  columns: ['M', 'J'],
  headerRows: 2,
  offMarker: 'OFF',
  offFillColor: '#FFFF00',
  tokenPages: ['https://a.example.com', 'https://b.example.com'],
  driveId: null,
  itemId: null,
}

const SAVED_TIMESHEET: TimesheetConfig = {
  logTime: '18:00',
  hrm: { mcpUrl: 'https://hrm.example.com/mcp', projectId: 'P-1' },
  tsc: SAVED_TSC,
}

function connected(hrmKeySource: SettingsView['hrmKeySource']): SettingsView {
  const base = settingsView({ hrmKeySource })
  return { ...base, config: { ...base.config, timesheet: SAVED_TIMESHEET } }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it('Save sends the timesheet block and leaves out an untouched HRM key', async () => {
  const fetchMock = stubFetch(() => jsonResponse(connected('file')))
  renderWithQuery(<TimesheetSection settings={connected('file')} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  const body = sentJson(fetchMock)
  expect(body).not.toHaveProperty('hrmApiKey')
  expect(body['timesheet']).toEqual(SAVED_TIMESHEET)
})

it('Save sends null for an HRM and TSC group left empty, and a typed key', async () => {
  const fetchMock = stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<TimesheetSection settings={settingsView()} />)
  fireEvent.change(screen.getByLabelText('Log time'), { target: { value: '17:30' } })
  fireEvent.change(screen.getByLabelText('HRM API key'), { target: { value: 'secret' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  const body = sentJson(fetchMock)
  expect(body['timesheet']).toEqual({ logTime: '17:30', hrm: null, tsc: null })
  expect(body['hrmApiKey']).toBe('secret')
})

it('Save shows the key message when the server answers 400', async () => {
  stubFetch(() => jsonResponse({ error: 'hrmApiKey is required' }, 400))
  renderWithQuery(<TimesheetSection settings={connected('file')} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Enter the HRM key again for the new URL')).toBeInTheDocument()
})

it('an env HRM key locks the key box', () => {
  renderWithQuery(<TimesheetSection settings={connected('env')} />)
  expect(screen.getByLabelText('HRM API key')).toBeDisabled()
  expect(screen.getByText('Set by WORKDAY_HRM_API_KEY')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Replace' })).not.toBeInTheDocument()
})

it('Check HRM shows rejected for a wrong key', async () => {
  const fetchMock = stubFetch(() => jsonResponse({ ok: false, error: { code: 'hrmRejected' } }))
  renderWithQuery(<TimesheetSection settings={connected('file')} />)
  fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
  fireEvent.change(screen.getByLabelText('HRM API key'), { target: { value: 'wrong' } })
  fireEvent.click(screen.getByRole('button', { name: 'Check HRM' }))
  expect(await screen.findByText('HRM rejected the entry')).toBeInTheDocument()
  expect(sentJson(fetchMock)).toEqual({ mcpUrl: 'https://hrm.example.com/mcp', hrmApiKey: 'wrong' })
})

it('Sign in to TSC disables the button while it runs', async () => {
  let finish: (response: Response) => void = () => undefined
  const pending = new Promise<Response>((resolve) => {
    finish = resolve
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(() => pending),
  )
  renderWithQuery(<TimesheetSection settings={connected('file')} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign in to TSC' }))
  expect(screen.getByRole('button', { name: 'Sign in to TSC' })).toBeDisabled()
  finish(jsonResponse({ ok: false, error: { code: 'chromeMissing' }, detail: 'no chrome' }))
  const message = await screen.findByText('Google Chrome is not installed')
  expect(message).toHaveAttribute('title', 'no chrome')
  expect(screen.getByRole('button', { name: 'Sign in to TSC' })).toBeEnabled()
})

it('Check TSC session shows the sign-in state', async () => {
  stubFetch(() => jsonResponse({ signedIn: true }))
  renderWithQuery(<TimesheetSection settings={connected('file')} />)
  fireEvent.click(screen.getByRole('button', { name: 'Check TSC session' }))
  expect(await screen.findByText('Signed in to TSC')).toBeInTheDocument()
})

it('Save sends the advanced TSC fields', async () => {
  const fetchMock = stubFetch(() => jsonResponse(connected('file')))
  renderWithQuery(<TimesheetSection settings={connected('file')} />)
  fireEvent.click(screen.getByRole('button', { name: 'Advanced TSC' }))
  fireEvent.change(screen.getByLabelText('Header rows'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('Drive id'), { target: { value: 'd1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  expect(sentJson(fetchMock)['timesheet']).toEqual({
    ...SAVED_TIMESHEET,
    tsc: { ...SAVED_TSC, headerRows: 3, driveId: 'd1' },
  })
})
