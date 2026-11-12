import { queueDayState, todayIn, type TimesheetView, type ZonedClock } from '@workday/core'

const MINUTES_PER_HOUR = 60

export function logTimeMinutes(logTime: string): number {
  const [hours = 0, minutes = 0] = logTime.split(':').map(Number)
  return hours * MINUTES_PER_HOUR + minutes
}

function isTodayLogged(view: TimesheetView, today: string): boolean {
  const day = view.week?.coverage?.find((item) => item.date === today)
  return day !== undefined && !day.isOff && day.hrmHours !== null && day.hrmHours > 0
}

// The 6 PM reminder fired today and nothing has been queued or logged for today since.
export function showReminder(view: TimesheetView, clock: ZonedClock, timeZone: string): boolean {
  const { lastRun } = view
  if (lastRun === null || lastRun.kind !== 'reminder') {
    return false
  }
  return (
    todayIn(timeZone, new Date(lastRun.at)) === clock.date &&
    !view.queue.some((entry) => entry.date === clock.date) &&
    !isTodayLogged(view, clock.date)
  )
}

export function hasDueDay(view: TimesheetView, clock: ZonedClock): boolean {
  const minutes = logTimeMinutes(view.logTime)
  return view.queue.some((entry) => queueDayState(entry.date, clock, minutes) === 'due')
}

// The dot on the Timesheet nav item.
export function needsAttention(view: TimesheetView, clock: ZonedClock, timeZone: string): boolean {
  return showReminder(view, clock, timeZone) || hasDueDay(view, clock)
}
