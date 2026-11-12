import { matchesTicket, type BoardRow } from '@workday/core'

export type BoardViewId = 'working' | 'done' | 'dismissed'

export const VIEW_IDS: readonly BoardViewId[] = ['working', 'done', 'dismissed']

export type ViewCounts = Readonly<Record<BoardViewId, number>>

export function viewOfRow(row: BoardRow): BoardViewId {
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

export function countViews(rows: readonly BoardRow[], search: string): ViewCounts {
  const counts = { working: 0, done: 0, dismissed: 0 }
  for (const row of filterRows(rows, search)) {
    counts[viewOfRow(row)] += 1
  }
  return counts
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
  view: BoardViewId,
  search: string,
): readonly BoardRow[] {
  const inView = filterRows(rows, search).filter((row) => viewOfRow(row) === view)
  return [...inView].sort(view === 'working' ? compareWorking : compareRecent)
}

// The current view when it has hits, else the first view that does.
export function pickViewWithHits(counts: ViewCounts, current: BoardViewId): BoardViewId {
  if (counts[current] !== 0) {
    return current
  }
  return VIEW_IDS.find((view) => counts[view] !== 0) ?? current
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
