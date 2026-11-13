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
  })
  expect(await screen.findByText('Signed in to Teams.')).toBeInTheDocument()
})

it('the teams form round-trips an unset lead', () => {
  const form = formFromTeams({ watchedChannels: ['A > B'], postLeadName: null, postGreeting: null })
  expect(teamsFromForm(form).postLeadName).toBeNull()
})
