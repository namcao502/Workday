import type { HrmTask } from '../timesheet/timesheetWeek.js'

// HRM.
export type HoursWrite = { readonly ok: true } | { readonly ok: false; readonly detail: string }

export interface HoursLog {
  validate(): Promise<
    { readonly ok: true } | { readonly ok: false; readonly reason: 'rejected' | 'unreachable' }
  >
  // minutes: one per ticket, already resolved from the even split.
  logTickets(
    date: string,
    tickets: readonly string[],
    minutes: readonly number[],
  ): Promise<HoursWrite>
  dayHours(dates: readonly string[]): Promise<Readonly<Record<string, number | null>>> // never rejects
  tasks(from: string, to: string): Promise<readonly HrmTask[] | null> // never rejects
  offDates(from: string, to: string): Promise<readonly LeaveDay[]> // never rejects; FORBIDDEN -> []
}

// A full day of leave with a request in HRM; approved stays false until a reviewer approves it.
export interface LeaveDay {
  readonly date: string
  readonly approved: boolean
}
