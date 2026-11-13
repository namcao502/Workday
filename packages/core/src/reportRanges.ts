import { addDays, mondayOf } from './zonedDate.js'

export type ReportRangeKind = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom'

export interface ReportRange {
  readonly kind: ReportRangeKind
  readonly from: string // "YYYY-MM-DD", inclusive
  readonly to: string // "YYYY-MM-DD", inclusive
}

// A custom range is built from the user's two dates, never from today. Weeks start on Monday.
export function rangeFor(kind: Exclude<ReportRangeKind, 'custom'>, today: string): ReportRange {
  const monday = mondayOf(today)
  const firstOfMonth = `${today.slice(0, 8)}01`
  switch (kind) {
    case 'thisWeek':
      return { kind, from: monday, to: today }
    case 'lastWeek':
      return { kind, from: addDays(monday, -7), to: addDays(monday, -1) }
    case 'thisMonth':
      return { kind, from: firstOfMonth, to: today }
    case 'lastMonth': {
      const lastDay = addDays(firstOfMonth, -1)
      return { kind, from: `${lastDay.slice(0, 8)}01`, to: lastDay }
    }
  }
}
