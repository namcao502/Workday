import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, sentJson, settingsView, stubFetch } from '../testSupport.js'
import { TeamsSection } from './TeamsSection.js'
import { formFromTeams, teamsFromForm } from './teamsForm.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('teams section saves watched channels in order', async () => {
  const fetchMock = stubFetch((url) =>
    url === '/api/teams/status'
      ? jsonResponse({ configured: true, signedIn: true })
      : jsonResponse(settingsView()),
  )
  renderWithQuery(<TeamsSection settings={settingsView()} />)
  fireEvent.change(screen.getByLabelText('Watched channels'), {
    target: { value: ' Dev > General \n\nOps > Alerts ' },
  })
  fireEvent.change(screen.getByLabelText('Lead name'), { target: { value: 'Minh' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true)
  })
  expect(sentJson(fetchMock)['teams']).toEqual({
    watchedChannels: ['Dev > General', 'Ops > Alerts'],
    postLeadName: 'Minh',
    postGreeting: null,
    dbReviewChannel: null,
  })
  expect(await screen.findByText('Signed in to Teams.')).toBeInTheDocument()
})

it('the teams form round-trips an unset lead', () => {
  const form = formFromTeams({
    watchedChannels: ['A > B'],
    postLeadName: null,
    postGreeting: null,
    dbReviewChannel: null,
  })
  expect(teamsFromForm(form).postLeadName).toBeNull()
})

function teamsStub() {
  return stubFetch((url) =>
    url === '/api/teams/status'
      ? jsonResponse({ configured: true, signedIn: true })
      : jsonResponse(settingsView()),
  )
}

it('TeamsSection saves dbReviewChannel when both names are filled', async () => {
  const fetchMock = teamsStub()
  renderWithQuery(<TeamsSection settings={settingsView()} />)
  fireEvent.change(screen.getByLabelText('Database Review team'), { target: { value: ' Dev ' } })
  fireEvent.change(screen.getByLabelText('Database Review channel'), { target: { value: 'DB' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true)
  })
  expect(sentJson(fetchMock)['teams']).toMatchObject({
    dbReviewChannel: { teamName: 'Dev', channelName: 'DB' },
  })
})

it('TeamsSection clears dbReviewChannel when both are empty', async () => {
  const fetchMock = teamsStub()
  const base = settingsView()
  const settings = {
    ...base,
    config: {
      ...base.config,
      teams: {
        ...base.config.teams,
        dbReviewChannel: { teamName: 'Dev', channelName: 'DB' },
      },
    },
  }
  renderWithQuery(<TeamsSection settings={settings} />)
  fireEvent.change(screen.getByLabelText('Database Review team'), { target: { value: '' } })
  fireEvent.change(screen.getByLabelText('Database Review channel'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true)
  })
  expect(sentJson(fetchMock)['teams']).toMatchObject({ dbReviewChannel: null })
})

it('TeamsSection refuses to save when only one Database Review name is filled', async () => {
  const fetchMock = teamsStub()
  renderWithQuery(<TeamsSection settings={settingsView()} />)
  fireEvent.change(screen.getByLabelText('Database Review team'), { target: { value: 'Dev' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText(/Fill both/)).toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
})
