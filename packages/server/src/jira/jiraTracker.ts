import {
  isTicketKey,
  type EpicTicket,
  type JiraConfig,
  type Ticket,
  type TicketTracker,
  type TrackerValidation,
} from '@workday/core'
import { isRecord } from '../jsonFile.js'
import { retryTransient } from '../retry.js'
import {
  findTransitionId,
  parseAssignee,
  parseEpicTickets,
  parseIssue,
  parseSearchResponse,
  type JiraFieldIds,
} from './parseJira.js'

const REQUEST_TIMEOUT_MILLISECONDS = 30_000
const EPIC_FIELDS: readonly string[] = ['summary', 'status', 'issuetype', 'priority', 'duedate']
const BASE_FIELDS: readonly string[] = [
  'summary',
  'duedate',
  'status',
  'timespent',
  'issuetype',
  'updated',
  'parent',
]

export class JiraTracker implements TicketTracker {
  private readonly baseUrl: string
  private readonly authorization: string
  private readonly fieldIds: JiraFieldIds
  private readonly fields: readonly string[]

  constructor(
    private readonly config: JiraConfig,
    token: string,
    private readonly fetchFunction: typeof fetch = fetch,
  ) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.authorization = `Basic ${Buffer.from(`${config.email}:${token}`).toString('base64')}`
    this.fieldIds = {
      etaFieldId: config.etaFieldId,
      devPriorityFieldId: config.devPriorityFieldId,
    }
    this.fields = [
      ...BASE_FIELDS,
      ...[config.etaFieldId, config.devPriorityFieldId].filter(
        (fieldId): fieldId is string => fieldId !== null,
      ),
    ]
  }

  async validate(): Promise<TrackerValidation> {
    try {
      const response = await this.send('GET', '/rest/api/3/myself')
      if (response.status === 401 || response.status === 403) {
        return { ok: false, reason: 'rejected' }
      }
      if (!response.ok) {
        return { ok: false, reason: 'unreachable' }
      }
      const body: unknown = await response.json()
      const displayName = isRecord(body) ? body['displayName'] : undefined
      return {
        ok: true,
        displayName: typeof displayName === 'string' ? displayName : this.config.email,
      }
    } catch {
      return { ok: false, reason: 'unreachable' }
    }
  }

  async getAssignedTickets(): Promise<Readonly<Record<string, Ticket>>> {
    const response = await this.send('POST', '/rest/api/3/search/jql', {
      jql: this.config.assignedJql,
      maxResults: this.config.maxResults,
      fields: this.fields,
    })
    if (!response.ok) {
      throw new Error(`Jira search failed with status ${String(response.status)}`)
    }
    const body: unknown = await response.json()
    return parseSearchResponse(body, this.fieldIds)
  }

  async getTicket(key: string): Promise<Ticket | null> {
    const fieldList = this.fields.join(',')
    const response = await this.send(
      'GET',
      `/rest/api/3/issue/${encodeURIComponent(key)}?fields=${fieldList}`,
    )
    if (response.status === 404) {
      return null
    }
    if (!response.ok) {
      throw new Error(`Jira issue lookup failed with status ${String(response.status)}`)
    }
    const body: unknown = await response.json()
    return parseIssue(body, this.fieldIds)
  }

  // The keys of those among `keys` that match the configured "mine" JQL.
  async filterMine(keys: readonly string[]): Promise<ReadonlySet<string>> {
    // Only real keys go into the JQL, so no typed text can change the query.
    const ticketKeys = keys.filter(isTicketKey)
    if (ticketKeys.length === 0) {
      return new Set()
    }
    const response = await this.send('POST', '/rest/api/3/search/jql', {
      jql: `key in (${ticketKeys.join(',')}) AND (${this.config.mineJql})`,
      maxResults: ticketKeys.length,
      fields: ['summary'],
    })
    if (!response.ok) {
      throw new Error(`Jira search failed with status ${String(response.status)}`)
    }
    const body: unknown = await response.json()
    const issues =
      isRecord(body) && Array.isArray(body['issues']) ? (body['issues'] as unknown[]) : []
    const found = new Set<string>()
    for (const issue of issues) {
      const key = isRecord(issue) ? issue['key'] : undefined
      if (typeof key === 'string') {
        found.add(key)
      }
    }
    return found
  }

  ticketUrl(key: string): string {
    return `${this.baseUrl}/browse/${key}`
  }

  async searchEpicTickets(jql: string, maxResults: number): Promise<readonly EpicTicket[]> {
    const fields = [
      ...EPIC_FIELDS,
      ...(this.config.devPriorityFieldId === null ? [] : [this.config.devPriorityFieldId]),
    ]
    const response = await retryTransient(() =>
      this.send('POST', '/rest/api/3/search/jql', { jql, maxResults, fields }),
    )
    if (!response.ok) {
      throw new Error(`Jira search failed with status ${String(response.status)}`)
    }
    return parseEpicTickets(await response.json(), this.config.devPriorityFieldId)
  }

  // Only the GET is retried: a POST re-sent after a lost response could apply twice.
  async transition(key: string, status: string): Promise<boolean> {
    const path = `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`
    const listed = await retryTransient(() => this.send('GET', path))
    if (!listed.ok) {
      throw new Error(`Jira transitions lookup failed with status ${String(listed.status)}`)
    }
    const transitionId = findTransitionId(await listed.json(), status)
    if (transitionId === null) {
      return false
    }
    const applied = await this.send('POST', path, { transition: { id: transitionId } })
    if (!applied.ok) {
      throw new Error(`Jira transition failed with status ${String(applied.status)}`)
    }
    return true
  }

  // Never takes over a ticket someone else holds; a repeated PUT of the same assignee is harmless, so it is retried.
  async assignToMe(key: string): Promise<string | null> {
    const myself = await retryTransient(() => this.send('GET', '/rest/api/3/myself'))
    if (!myself.ok) {
      throw new Error(`Jira myself lookup failed with status ${String(myself.status)}`)
    }
    const me: unknown = await myself.json()
    const accountId = isRecord(me) ? me['accountId'] : undefined
    if (typeof accountId !== 'string' || accountId === '') {
      throw new Error('Jira /myself returned no accountId')
    }
    const issuePath = `/rest/api/3/issue/${encodeURIComponent(key)}`
    const issue = await retryTransient(() => this.send('GET', `${issuePath}?fields=assignee`))
    if (!issue.ok) {
      throw new Error(`Jira issue lookup failed with status ${String(issue.status)}`)
    }
    const assignee = parseAssignee(await issue.json())
    if (assignee.accountId === accountId) {
      return null
    }
    if (assignee.accountId !== null) {
      return assignee.displayName ?? assignee.accountId
    }
    const assigned = await retryTransient(() =>
      this.send('PUT', `${issuePath}/assignee`, { accountId }),
    )
    if (!assigned.ok) {
      throw new Error(`Jira assign failed with status ${String(assigned.status)}`)
    }
    return null
  }

  private send(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: this.authorization,
      Accept: 'application/json',
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    }
    if (body !== undefined) {
      init.body = JSON.stringify(body)
    }
    return this.fetchFunction(`${this.baseUrl}${path}`, init)
  }
}
