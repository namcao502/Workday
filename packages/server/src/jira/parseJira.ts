import type { EpicTicket, Ticket } from '@workday/core'
import { isRecord } from '../jsonFile.js'

export interface JiraFieldIds {
  readonly etaFieldId: string | null
  readonly devPriorityFieldId: string | null
}

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function objectOrEmpty(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {}
}

// A subtask's parent is its parent ticket; any other issue's parent is an Epic, which has no branch.
function readParentKey(fields: Readonly<Record<string, unknown>>): string | null {
  const issueType = objectOrEmpty(fields['issuetype'])
  if (issueType['subtask'] !== true) {
    return null
  }
  const parentKey = textOrNull(objectOrEmpty(fields['parent'])['key'])
  return parentKey !== null && ISSUE_KEY_PATTERN.test(parentKey) ? parentKey : null
}

// An issue without a key gives null; every other bad shape reads as null fields.
export function parseIssue(raw: unknown, fieldIds: JiraFieldIds): Ticket | null {
  const issue = objectOrEmpty(raw)
  const key = textOrNull(issue['key'])
  if (key === null || key === '') {
    return null
  }
  const fields = objectOrEmpty(issue['fields'])
  const status = objectOrEmpty(fields['status'])
  const etaFieldId = fieldIds.etaFieldId
  const devPriorityFieldId = fieldIds.devPriorityFieldId
  return {
    key,
    summary: textOrNull(fields['summary']) ?? '',
    dueDate: textOrNull(fields['duedate']),
    eta: etaFieldId === null ? null : textOrNull(fields[etaFieldId]),
    devPriority: devPriorityFieldId === null ? null : numberOrNull(fields[devPriorityFieldId]),
    status: textOrNull(status['name']),
    // The category key, not its name: the name is localized.
    statusCategory: textOrNull(objectOrEmpty(status['statusCategory'])['key']),
    issueType: textOrNull(objectOrEmpty(fields['issuetype'])['name']),
    timeSpentSeconds: numberOrNull(fields['timespent']),
    updated: textOrNull(fields['updated']),
    parentKey: readParentKey(fields),
  }
}

export function parseSearchResponse(
  raw: unknown,
  fieldIds: JiraFieldIds,
): Readonly<Record<string, Ticket>> {
  const issues = objectOrEmpty(raw)['issues']
  const tickets: Record<string, Ticket> = {}
  if (!Array.isArray(issues)) {
    return tickets
  }
  const issueList: readonly unknown[] = issues
  for (const issue of issueList) {
    const ticket = parseIssue(issue, fieldIds)
    if (ticket !== null) {
      tickets[ticket.key] = ticket
    }
  }
  return tickets
}

function namedOrNull(value: unknown): string | null {
  return textOrNull(objectOrEmpty(value)['name'])
}

// Jira's order is kept; an issue without a key is skipped.
export function parseEpicTickets(
  raw: unknown,
  devPriorityFieldId: string | null,
): readonly EpicTicket[] {
  const issues = objectOrEmpty(raw)['issues']
  if (!Array.isArray(issues)) {
    return []
  }
  const tickets: EpicTicket[] = []
  for (const issue of issues as readonly unknown[]) {
    const key = textOrNull(objectOrEmpty(issue)['key'])
    if (key === null || key === '') {
      continue
    }
    const fields = objectOrEmpty(objectOrEmpty(issue)['fields'])
    tickets.push({
      key,
      summary: textOrNull(fields['summary']) ?? '',
      status: namedOrNull(fields['status']),
      issueType: namedOrNull(fields['issuetype']),
      priority: namedOrNull(fields['priority']),
      devPriority: devPriorityFieldId === null ? null : numberOrNull(fields[devPriorityFieldId]),
      dueDate: textOrNull(fields['duedate']),
    })
  }
  return tickets
}

// The id of the transition whose target status is `targetStatus` (case-insensitive), else null.
export function findTransitionId(raw: unknown, targetStatus: string): string | null {
  const transitions = objectOrEmpty(raw)['transitions']
  if (!Array.isArray(transitions)) {
    return null
  }
  const wanted = targetStatus.toLowerCase()
  for (const transition of transitions as readonly unknown[]) {
    const name = namedOrNull(objectOrEmpty(transition)['to'])
    if (name !== null && name.toLowerCase() === wanted) {
      return textOrNull(objectOrEmpty(transition)['id'])
    }
  }
  return null
}

export interface Assignee {
  readonly accountId: string | null
  readonly displayName: string | null
}

export function parseAssignee(raw: unknown): Assignee {
  const assignee = objectOrEmpty(objectOrEmpty(raw)['fields'])['assignee']
  const source = objectOrEmpty(assignee)
  return { accountId: textOrNull(source['accountId']), displayName: textOrNull(source['displayName']) }
}
