import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { JiraConfig, SettingsView } from '@workday/core'
import { afterEach, expect, it, vi } from 'vitest'
import { ConnectionsSection } from './ConnectionsSection.js'
import { jsonResponse, renderWithQuery, sentJson, settingsView, stubFetch } from '../testSupport.js'

const SAVED_JIRA: JiraConfig = {
  baseUrl: 'https://example.atlassian.net',
  email: 'me@example.com',
  projectKey: 'ABC',
  assignedJql: 'assignee = currentUser()',
  maxResults: 50,
  etaFieldId: null,
  devPriorityFieldId: null,
  statusFlow: { preWorkStatuses: ['To Do'], reworkStatuses: ['Reopened'] },
}

function connectedSettings(tokenSource: SettingsView['jiraTokenSource']): SettingsView {
  const base = settingsView({ jiraTokenSource: tokenSource })
  return { ...base, config: { ...base.config, jira: SAVED_JIRA } }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it('the token box shows a mask and Replace when a token is saved', () => {
  renderWithQuery(<ConnectionsSection settings={connectedSettings('file')} />)
  expect(screen.getByLabelText('Jira API token')).toHaveValue('•'.repeat(8))
  expect(screen.getByLabelText('Jira API token')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
  expect(screen.getByLabelText('Jira API token')).toHaveValue('')
  expect(screen.getByLabelText('Jira API token')).toBeEnabled()
})

it('Save without a new token does not send jiraApiToken', async () => {
  const fetchMock = stubFetch(() => jsonResponse(connectedSettings('file')))
  renderWithQuery(<ConnectionsSection settings={connectedSettings('file')} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  const body = sentJson(fetchMock)
  expect(body).not.toHaveProperty('jiraApiToken')
  expect(body).toHaveProperty('jira.baseUrl', 'https://example.atlassian.net')
})

it('Save sends the project key and the advanced fields', async () => {
  const fetchMock = stubFetch(() => jsonResponse(connectedSettings('file')))
  renderWithQuery(<ConnectionsSection settings={connectedSettings('file')} />)
  fireEvent.change(screen.getByLabelText('Ticket key prefix'), { target: { value: 'XYZ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
  fireEvent.change(screen.getByLabelText('ETA date field id'), {
    target: { value: 'customfield_1' },
  })
  fireEvent.change(screen.getByLabelText('Dev priority field id'), {
    target: { value: 'customfield_2' },
  })
  fireEvent.change(screen.getByLabelText('Assigned tickets query (JQL)'), {
    target: { value: 'project = XYZ' },
  })
  fireEvent.change(screen.getByLabelText('Statuses before work starts'), {
    target: { value: 'To Do\n Backlog \n' },
  })
  fireEvent.change(screen.getByLabelText('Statuses that mean sent back'), {
    target: { value: 'Reopened' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  expect(sentJson(fetchMock)['jira']).toEqual({
    ...SAVED_JIRA,
    projectKey: 'XYZ',
    etaFieldId: 'customfield_1',
    devPriorityFieldId: 'customfield_2',
    assignedJql: 'project = XYZ',
    statusFlow: { preWorkStatuses: ['To Do', 'Backlog'], reworkStatuses: ['Reopened'] },
  })
})

it('an env token locks the token box', () => {
  renderWithQuery(<ConnectionsSection settings={connectedSettings('env')} />)
  expect(screen.getByLabelText('Jira API token')).toBeDisabled()
  expect(
    screen.getByText('Taken from WORKDAY_JIRA_API_TOKEN in .env - nothing to enter'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Replace' })).not.toBeInTheDocument()
})

it('each Jira field explains what to enter', () => {
  renderWithQuery(<ConnectionsSection settings={connectedSettings(null)} />)
  expect(screen.getByLabelText('Ticket key prefix')).toHaveAccessibleDescription(
    'The letters before the number in a ticket key: MDP for MDP-1234',
  )
  expect(screen.getByLabelText('Jira API token')).toHaveAccessibleDescription(
    'Create one at id.atlassian.com > Security > API tokens. It is not your password.',
  )
  expect(screen.getByLabelText('Jira site URL')).toHaveAttribute(
    'placeholder',
    'https://yourcompany.atlassian.net',
  )
})
