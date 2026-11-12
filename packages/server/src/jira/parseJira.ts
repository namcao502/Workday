import type { Ticket } from '@workday/core'
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
