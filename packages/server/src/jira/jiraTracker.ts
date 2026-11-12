import type { JiraConfig, Ticket, TicketTracker, TrackerValidation } from '@workday/core'
import { isRecord } from '../jsonFile.js'
import { parseIssue, parseSearchResponse, type JiraFieldIds } from './parseJira.js'

const REQUEST_TIMEOUT_MILLISECONDS = 30_000
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

  ticketUrl(key: string): string {
    return `${this.baseUrl}/browse/${key}`
  }

  private send(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
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
