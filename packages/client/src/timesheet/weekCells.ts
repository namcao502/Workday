import { hrmWeekTotal, type DayCoverage, type LogDayView } from '@workday/core'
import { t } from '../i18n.js'
import { holidayName } from './holidayName.js'
import { formatMinutes } from './timesheetText.js'

const DAY_MINUTES = 480
const MINUTES_PER_HOUR = 60
const DONE_MARK = String.fromCodePoint(0x2713)

// ok = done, miss = a past day still short, wait = today or queued, off = leave or holiday, none = nothing to say.
export type CellTone = 'ok' | 'miss' | 'wait' | 'off' | 'none'

export interface MatrixCell {
  readonly tone: CellTone
  readonly text: string
  readonly short: string // for a phone, where a column is a few letters wide
}

const NONE: MatrixCell = { tone: 'none', text: '-', short: '-' }

function queuedMinutes(day: LogDayView): number {
  const entry = day.queued
  if (entry === null) {
    return 0
  }
  return entry.minutes === null ? DAY_MINUTES : entry.minutes.reduce((sum, value) => sum + value, 0)
}

function offCell(text: string): MatrixCell {
  return { tone: 'off', text, short: t('timesheet.offShort') }
}

function offLabel(coverage: DayCoverage): string {
  return coverage.holiday === null ? t('timesheet.leave') : holidayName(coverage.holiday)
}

function shortTone(date: string, today: string): CellTone {
  return date < today ? 'miss' : 'wait'
}

export function hrmCell(day: LogDayView, today: string): MatrixCell {
  const coverage = day.coverage
  if (coverage?.isOff === true) {
    return offCell(offLabel(coverage))
  }
  if (day.state === 'future') {
    return NONE
  }
  const minutes = Math.round((coverage?.hrmHours ?? 0) * MINUTES_PER_HOUR)
  if (minutes >= DAY_MINUTES) {
    return {
      tone: 'ok',
      text: `${DONE_MARK} ${formatMinutes(minutes)}`,
      short: formatMinutes(minutes),
    }
  }
  if (day.queued !== null) {
    const queued = formatMinutes(queuedMinutes(day))
    return { tone: 'wait', text: `${t('timesheet.queued')} ${queued}`, short: queued }
  }
  if (coverage === null) {
    return NONE
  }
  const text = `${formatMinutes(minutes)} / 8h`
  return { tone: shortTone(day.date, today), text, short: formatMinutes(minutes) }
}

export function tscCell(day: LogDayView, today: string): MatrixCell {
  const coverage = day.coverage
  if (coverage?.isOff === true) {
    return offCell((coverage.tscText ?? '').trim() || 'OFF')
  }
  if (day.state === 'future') {
    return NONE
  }
  const text = (coverage?.tscText ?? '').trim()
  if (coverage !== null && coverage.tscState === 'read' && text !== '') {
    return { tone: 'ok', text: `${DONE_MARK} ${text}`, short: DONE_MARK }
  }
  if (day.queued !== null) {
    return { tone: 'wait', text: t('timesheet.queued'), short: '...' }
  }
  if (coverage === null || coverage.tscState !== 'read') {
    return NONE
  }
  return { tone: shortTone(day.date, today), text: t('timesheet.tscEmpty'), short: '0' }
}

// Days up to today that are not off: how many carry TSC text, out of how many.
export function tscTotal(
  coverage: readonly DayCoverage[],
  today: string,
): { readonly done: number; readonly of: number } {
  const days = coverage.filter((day) => day.date <= today && !day.isOff)
  const done = days.filter((day) => (day.tscText ?? '').trim() !== '').length
  return { done, of: days.length }
}

export function hrmTotal(
  coverage: readonly DayCoverage[],
  today: string,
): { readonly hours: number; readonly target: number } {
  const total = hrmWeekTotal(coverage, today)
  return { hours: total.hours, target: total.targetHours }
}

// "HRM, TSC" for what a day still lacks; empty when nothing.
function lacking(day: LogDayView, today: string): readonly string[] {
  return [
    ...(hrmCell(day, today).tone === 'miss' ? ['HRM'] : []),
    ...(tscCell(day, today).tone === 'miss' ? ['TSC'] : []),
  ]
}

// The past days that are still short, as "Wed 25 (HRM, TSC)".
export function missingDays(
  days: readonly LogDayView[],
  today: string,
  label: (date: string) => string,
): readonly string[] {
  return days.flatMap((day) => {
    const what = lacking(day, today)
    return what.length === 0 ? [] : [`${label(day.date)} (${what.join(', ')})`]
  })
}

// What today still needs, or null when it is done, off, queued or not in this week.
export function todayNeeds(days: readonly LogDayView[], today: string): string | null {
  const day = days.find((candidate) => candidate.date === today)
  if (day === undefined || day.queued !== null) {
    return null
  }
  const hrm = hrmCell(day, today)
  const tsc = tscCell(day, today)
  const what = [
    ...(hrm.tone === 'wait'
      ? [
          `HRM ${formatMinutes(DAY_MINUTES - Math.round((day.coverage?.hrmHours ?? 0) * MINUTES_PER_HOUR))}`,
        ]
      : []),
    ...(tsc.tone === 'wait' ? ['TSC'] : []),
  ]
  return what.length === 0 ? null : what.join(', ')
}
