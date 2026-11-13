import { matchesTicket, type BoardRow, type Suggestion, type TodoGroup } from '@workday/core'

// The views that list board rows; 'todo' lists WorkView groups, 'available' the epic's suggestions.
export type RowViewId = 'working' | 'done' | 'dismissed'
export type BoardViewId = 'todo' | 'available' | RowViewId

// Available sits between Working and Done, as in the WPF board.
export const VIEW_IDS: readonly BoardViewId[] = [
  'todo',
  'working',
  'available',
  'done',
  'dismissed',
]

// The todo and available counts come from the work view, which only the page knows.
export type ViewCounts = Readonly<Record<RowViewId, number>> & {
  readonly todo?: number
  readonly available?: number
}

export function viewOfRow(row: BoardRow): RowViewId {
  switch (row.section) {
    case 'new':
    case 'inProgress':
      return 'working'
    case 'done':
      return 'done'
    case 'dismissed':
      return 'dismissed'
  }
}

function filterRows(rows: readonly BoardRow[], search: string): readonly BoardRow[] {
  return rows.filter((row) => matchesTicket(row.ticket, search))
}

export function countViews(
  rows: readonly BoardRow[],
  search: string,
): Readonly<Record<RowViewId, number>> {
  const counts = { working: 0, done: 0, dismissed: 0 }
  for (const row of filterRows(rows, search)) {
    counts[viewOfRow(row)] += 1
  }
  return counts
}

// Same words rule as the board rows: every word in the key or summary.
export function filterSuggestions(
  items: readonly Suggestion[],
  search: string,
): readonly Suggestion[] {
  const words = search
    .split(/\s+/)
    .filter((word) => word.length !== 0)
    .map((word) => word.toLowerCase())
  return items.filter((item) => {
    const text = `${item.ticket.key} ${item.ticket.summary}`.toLowerCase()
    return words.every((word) => text.includes(word))
  })
}

function compareKeys(left: BoardRow, right: BoardRow): number {
  return left.ticket.key.localeCompare(right.ticket.key, 'en', { numeric: true })
}

// Earliest due first, undated tickets last.
function compareWorking(left: BoardRow, right: BoardRow): number {
  const leftDue = left.ticket.dueDate
  const rightDue = right.ticket.dueDate
  if (leftDue !== rightDue) {
    if (leftDue === null) {
      return 1
    }
    if (rightDue === null) {
      return -1
    }
    return leftDue < rightDue ? -1 : 1
  }
  return compareKeys(left, right)
}

// Most recently updated first; ISO instants compare as strings.
function compareRecent(left: BoardRow, right: BoardRow): number {
  const leftUpdated = left.ticket.updated ?? ''
  const rightUpdated = right.ticket.updated ?? ''
  if (leftUpdated !== rightUpdated) {
    return leftUpdated < rightUpdated ? 1 : -1
  }
  return compareKeys(left, right)
}

export function rowsForView(
  rows: readonly BoardRow[],
  view: RowViewId,
  search: string,
): readonly BoardRow[] {
  const inView = filterRows(rows, search).filter((row) => viewOfRow(row) === view)
  return [...inView].sort(view === 'working' ? compareWorking : compareRecent)
}

// The current view when it has hits, else the first view that does.
export function pickViewWithHits(counts: ViewCounts, current: BoardViewId): BoardViewId {
  if ((counts[current] ?? 0) !== 0) {
    return current
  }
  return VIEW_IDS.find((view) => (counts[view] ?? 0) !== 0) ?? current
}

// Only a Working ticket is urgent; Done and Dismissed rows never take the color.
export function dueClassName(row: BoardRow): string {
  if (viewOfRow(row) !== 'working') {
    return 'due'
  }
  switch (row.dueUrgency) {
    case 'overdue':
      return 'due due-overdue'
    case 'dueSoon':
      return 'due due-soon'
    case 'none':
      return 'due'
  }
}

// Search keeps whole groups: a group stays when its key, summary or a review title holds every word.
export function filterGroups(
  groups: readonly TodoGroup[],
  rows: readonly BoardRow[],
  search: string,
): readonly TodoGroup[] {
  const words = search
    .split(/\s+/)
    .filter((word) => word.length !== 0)
    .map((word) => word.toLowerCase())
  if (words.length === 0) {
    return groups
  }
  const summaries = new Map(rows.map((row) => [row.ticket.key, row.ticket.summary]))
  return groups.filter((group) => {
    const reviewTitles = group.items.map((item) =>
      item.kind === 'prReview' ? item.review.title : '',
    )
    const key = group.ticketKey ?? ''
    const text = [key, summaries.get(key) ?? '', ...reviewTitles].join(' ').toLowerCase()
    return words.every((word) => text.includes(word))
  })
}
