export interface Ticket {
  readonly key: string
  readonly summary: string
  readonly dueDate: string | null // "YYYY-MM-DD"
  readonly eta: string | null
  readonly devPriority: number | null
  readonly status: string | null
  readonly statusCategory: string | null
  readonly issueType: string | null
  readonly timeSpentSeconds: number | null
  readonly updated: string | null
  readonly parentKey: string | null
}

export type DueUrgency = 'none' | 'dueSoon' | 'overdue'
export type DevPriorityLevel = 'none' | 'top' | 'high' | 'normal'

// Due today or within this many days counts as due soon.
const DUE_SOON_DAYS = 2
const MILLISECONDS_PER_DAY = 86_400_000
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

// Day number of a "YYYY-MM-DD" date, or null when it is not a real calendar date.
function dayNumberOf(date: string): number | null {
  const match = DATE_PATTERN.exec(date)
  if (match === null) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const milliseconds = Date.UTC(year, month - 1, day)
  const parsed = new Date(milliseconds)
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }
  return milliseconds / MILLISECONDS_PER_DAY
}

// The statusCategory key Jira sends ("new" / "indeterminate" / "done"), not the display name.
export function isStatusDone(ticket: Ticket): boolean {
  return ticket.statusCategory?.toLowerCase() === 'done'
}

export function devPriorityLevel(devPriority: number | null): DevPriorityLevel {
  if (devPriority === null) {
    return 'none'
  }
  if (devPriority <= 1) {
    return 'top'
  }
  return devPriority <= 2 ? 'high' : 'normal'
}

// A ticket Jira already finished is never flagged, whatever its due date.
export function dueUrgency(ticket: Ticket, today: string): DueUrgency {
  if (isStatusDone(ticket) || ticket.dueDate === null) {
    return 'none'
  }
  const dueDay = dayNumberOf(ticket.dueDate)
  const todayDay = dayNumberOf(today)
  if (dueDay === null || todayDay === null) {
    return 'none'
  }
  if (dueDay < todayDay) {
    return 'overdue'
  }
  return dueDay - todayDay <= DUE_SOON_DAYS ? 'dueSoon' : 'none'
}

// Field-by-field equality, like a C# record: every Jira change (even a comment, via `updated`) counts.
export function ticketEquals(left: Ticket, right: Ticket): boolean {
  return (
    left.key === right.key &&
    left.summary === right.summary &&
    left.dueDate === right.dueDate &&
    left.eta === right.eta &&
    left.devPriority === right.devPriority &&
    left.status === right.status &&
    left.statusCategory === right.statusCategory &&
    left.issueType === right.issueType &&
    left.timeSpentSeconds === right.timeSpentSeconds &&
    left.updated === right.updated &&
    left.parentKey === right.parentKey
  )
}
