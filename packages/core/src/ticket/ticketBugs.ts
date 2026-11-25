// A bug QC logged against one of the user's tickets: a Defect or Bug linked in Jira to a ticket in progress or done.
import type { Ticket } from './ticket.js'

const BUG_TYPES: ReadonlySet<string> = new Set(['defect', 'bug'])

export function isBug(ticket: Ticket): boolean {
  return ticket.issueType !== null && BUG_TYPES.has(ticket.issueType.toLowerCase())
}

// A ticket in progress before a done one, then Jira's link order. A parent only in New or Dismissed is no parent.
export function parentOf(
  bug: Ticket,
  startedKeys: ReadonlySet<string>,
  doneKeys: ReadonlySet<string>,
): string | null {
  if (!isBug(bug)) {
    return null
  }
  return (
    bug.linkedKeys.find((key) => startedKeys.has(key)) ??
    bug.linkedKeys.find((key) => doneKeys.has(key)) ??
    null
  )
}
