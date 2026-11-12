import { readFileSync } from 'node:fs'
import type { JiraConfig } from '@workday/core'
import { describe, expect, it, vi } from 'vitest'
import { JiraTracker } from './jiraTracker.js'

const BASE_URL = 'https://example.atlassian.net'

const CONFIG: JiraConfig = {
  baseUrl: `${BASE_URL}/`,
  email: 'me@example.com',
  projectKey: 'MDP',
  assignedJql: 'assignee = currentUser()',
  maxResults: 50,
  etaFieldId: 'customfield_10735',
  devPriorityFieldId: 'customfield_11111',
  statusFlow: { preWorkStatuses: [], reworkStatuses: [] },
}

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
}

function respond(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
}

function trackerReturning(
  status: number,
  body: string,
  config: JiraConfig = CONFIG,
): { tracker: JiraTracker; fetchMock: FetchMock } {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(respond(status, body)))
  return { tracker: new JiraTracker(config, 'secret-token', fetchMock), fetchMock }
}

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

function sentBody(fetchMock: FetchMock): string {
  const body = fetchMock.mock.calls[0]?.[1]?.body
  return typeof body === 'string' ? body : ''
}

function sentUrl(fetchMock: FetchMock): string {
  const url = fetchMock.mock.calls[0]?.[0]
  return typeof url === 'string' ? url : ''
}

describe('getAssignedTickets', () => {
  it('posts the JQL search with Basic auth and the field list', async () => {
    const { tracker, fetchMock } = trackerReturning(200, fixture('search.json'))
    await tracker.getAssignedTickets()
    const call = fetchMock.mock.calls[0]
    expect(call?.[0]).toBe(`${BASE_URL}/rest/api/3/search/jql`)
    expect(call?.[1]?.method).toBe('POST')
    const headers = new Headers(call?.[1]?.headers)
    expect(headers.get('Accept')).toBe('application/json')
    const expectedAuth = `Basic ${Buffer.from('me@example.com:secret-token').toString('base64')}`
    expect(headers.get('Authorization')).toBe(expectedAuth)
    const body: unknown = JSON.parse(sentBody(fetchMock))
    expect(body).toEqual({
      jql: 'assignee = currentUser()',
      maxResults: 50,
      fields: [
        'summary',
        'duedate',
        'status',
        'timespent',
        'issuetype',
        'updated',
        'parent',
        'customfield_10735',
        'customfield_11111',
      ],
    })
  })

  it('reads status, due date, ETA, dev priority and time spent', async () => {
    const { tracker } = trackerReturning(200, fixture('search.json'))
    const tickets = await tracker.getAssignedTickets()
    expect(tickets['MDP-1']).toEqual({
      key: 'MDP-1',
      summary: 'Summary',
      dueDate: '2026-09-30',
      eta: '2026-09-29',
      devPriority: 3,
      status: 'PR & Code Review',
      statusCategory: 'indeterminate',
      issueType: 'New Feature',
      timeSpentSeconds: 5400,
      updated: '2026-10-19T10:15:30.123+0700',
      parentKey: null,
    })
  })

  it('returns nulls when the optional fields are null', async () => {
    const { tracker } = trackerReturning(200, fixture('search.json'))
    const ticket = (await tracker.getAssignedTickets())['MDP-3']
    expect(ticket).toMatchObject({
      dueDate: null,
      eta: null,
      devPriority: null,
      status: null,
      statusCategory: null,
      timeSpentSeconds: null,
    })
  })

  it('skips an issue without a usable key and keeps the rest', async () => {
    const { tracker } = trackerReturning(200, fixture('search.json'))
    const keys = Object.keys(await tracker.getAssignedTickets())
    expect(keys).toEqual(['MDP-1', 'MDP-2', 'MDP-3', 'MDP-8', 'MDP-9', 'MDP-4', 'MDP-5', 'MDP-6'])
  })

  it('parses an issue with missing or null fields', async () => {
    const { tracker } = trackerReturning(200, fixture('search.json'))
    const tickets = await tracker.getAssignedTickets()
    expect(tickets['MDP-9']).toMatchObject({ summary: '', dueDate: null, status: null })
    expect(tickets['MDP-8']).toMatchObject({ summary: '', timeSpentSeconds: null })
  })

  it('sets the parent key only for a subtask', async () => {
    const { tracker } = trackerReturning(200, fixture('search.json'))
    const tickets = await tracker.getAssignedTickets()
    expect(tickets['MDP-2']?.parentKey).toBe('MDP-1')
    expect(tickets['MDP-1']?.parentKey).toBeNull()
  })

  it('ignores a non-object status and a non-object status category', async () => {
    const { tracker } = trackerReturning(200, fixture('search.json'))
    const tickets = await tracker.getAssignedTickets()
    expect(tickets['MDP-4']).toMatchObject({ status: null, statusCategory: null })
    expect(tickets['MDP-5']).toMatchObject({ status: 'Backlog', statusCategory: null })
  })

  it('takes the status category from its key, not its localized name', async () => {
    const { tracker } = trackerReturning(200, fixture('search.json'))
    const tickets = await tracker.getAssignedTickets()
    expect(tickets['MDP-6']?.statusCategory).toBe('done')
  })

  it('returns no tickets when issues is missing or not an array', async () => {
    expect(await trackerReturning(200, '{}').tracker.getAssignedTickets()).toEqual({})
    expect(await trackerReturning(200, '{"issues":null}').tracker.getAssignedTickets()).toEqual({})
  })

  it('throws when Jira answers with an error', async () => {
    const { tracker } = trackerReturning(500, '{}')
    await expect(tracker.getAssignedTickets()).rejects.toThrow()
  })

  it('uses the configured ETA field id', async () => {
    const config: JiraConfig = {
      ...CONFIG,
      etaFieldId: 'customfield_99999',
      devPriorityFieldId: null,
    }
    const body =
      '{"issues":[{"key":"MDP-1","fields":{"customfield_99999":"2026-10-01","customfield_10735":"no"}}]}'
    const { tracker, fetchMock } = trackerReturning(200, body, config)
    const tickets = await tracker.getAssignedTickets()
    expect(tickets['MDP-1']?.eta).toBe('2026-10-01')
    const sent = sentBody(fetchMock)
    expect(sent).toContain('customfield_99999')
    expect(sent).not.toContain('customfield_10735')
  })
})

describe('getTicket', () => {
  it('reads a single issue', async () => {
    const { tracker, fetchMock } = trackerReturning(200, fixture('issue.json'))
    const ticket = await tracker.getTicket('MDP-2')
    expect(ticket).toMatchObject({ key: 'MDP-2', summary: 'Single', status: 'Backlog' })
    expect(sentUrl(fetchMock)).toContain('/rest/api/3/issue/MDP-2?fields=')
  })

  it('returns null on 404 and throws on 500', async () => {
    expect(await trackerReturning(404, '{}').tracker.getTicket('MDP-404')).toBeNull()
    await expect(trackerReturning(500, '{}').tracker.getTicket('MDP-1')).rejects.toThrow()
  })
})

describe('validate', () => {
  it('returns the display name when the credentials are accepted', async () => {
    const { tracker } = trackerReturning(200, '{"displayName":"Nam"}')
    expect(await tracker.validate()).toEqual({ ok: true, displayName: 'Nam' })
  })

  it('reports rejected credentials on 401', async () => {
    expect(await trackerReturning(401, '{}').tracker.validate()).toEqual({
      ok: false,
      reason: 'rejected',
    })
    expect(await trackerReturning(403, '{}').tracker.validate()).toEqual({
      ok: false,
      reason: 'rejected',
    })
  })

  it('reports unreachable on 404 and 5xx', async () => {
    expect(await trackerReturning(404, '{}').tracker.validate()).toEqual({
      ok: false,
      reason: 'unreachable',
    })
    expect(await trackerReturning(503, '{}').tracker.validate()).toEqual({
      ok: false,
      reason: 'unreachable',
    })
  })

  it('reports unreachable on a network error', async () => {
    const failingFetch = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')))
    const tracker = new JiraTracker(CONFIG, 'secret-token', failingFetch)
    expect(await tracker.validate()).toEqual({ ok: false, reason: 'unreachable' })
  })
})

describe('ticketUrl', () => {
  it('links to the browse page without a doubled slash', () => {
    const { tracker } = trackerReturning(200, '{}')
    expect(tracker.ticketUrl('MDP-1')).toBe(`${BASE_URL}/browse/MDP-1`)
  })
})
