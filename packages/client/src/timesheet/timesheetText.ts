import type { EntryOutcome, RunSummary, StepOutcome, WeekReviewItem } from '@workday/core'
import { errorText } from '../errors.js'
import { formatDateOnly, t, type Language } from '../i18n.js'

const MINUTES_PER_HOUR = 60
const DONE_MARK = String.fromCodePoint(0x2713)

// 150 -> "2h 30m", 480 -> "8h", 30 -> "30m".
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  const rest = minutes % MINUTES_PER_HOUR
  if (hours === 0 && rest === 0) {
    return '0h'
  }
  const hourPart = hours === 0 ? '' : `${String(hours)}h`
  const restPart = rest === 0 ? '' : `${String(rest)}m`
  return [hourPart, restPart].filter((part) => part !== '').join(' ')
}

// "not yours, did you mean MDP-6789?": what is wrong, without the key or the day.
export function issueText(item: WeekReviewItem): string {
  const issue = ((): string => {
    switch (item.issue) {
      case 'notFound':
        return t('no such ticket in Jira', 'không có ticket này trên Jira')
      case 'notMine':
        return t('not yours', 'không phải ticket của anh')
      case 'tscOnly':
        return t('in TSC but not HRM', 'có ở TSC nhưng không có ở HRM')
      case 'hrmOnly':
        return t('in HRM but not TSC', 'có ở HRM nhưng không có ở TSC')
    }
  })()
  const suggestion =
    item.suggestedKey === null
      ? ''
      : t(`, did you mean ${item.suggestedKey}?`, `, có phải ${item.suggestedKey}?`)
  return `${issue}${suggestion}`
}

function weekdayOfDate(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

// "MON 3" in English, "T2 03/11" in Vietnamese (Sunday is CN).
export function dayHeader(date: string, language: Language): string {
  const weekday = weekdayOfDate(date)
  const [, month = '', day = ''] = date.split('-')
  if (language === 'vi') {
    return `${weekday === 0 ? 'CN' : `T${String(weekday + 1)}`} ${day}/${month}`
  }
  const names = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  return `${names[weekday] ?? ''} ${String(Number(day))}`
}

// "Tue, Nov 11" in the app language.
export function dateLabel(date: string, language: Language): string {
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`))
}

// "18:00" -> "6:00 PM".
export function clockText(hhmm: string): string {
  const [hours = 0, minutes = 0] = hhmm.split(':').map(Number)
  const suffix = hours < 12 ? 'AM' : 'PM'
  const shown = hours % 12 === 0 ? 12 : hours % 12
  return `${String(shown)}:${String(minutes).padStart(2, '0')} ${suffix}`
}

export function queueStatusText(
  state: 'waiting' | 'due',
  minutesLeft: number,
  logTime: string,
  futureDate: string | null,
  language: Language = 'en',
): string {
  if (state === 'due') {
    return t('Past the auto-log time, not logged yet', 'Đã qua giờ tự log, chưa được log')
  }
  const at = clockText(logTime)
  if (futureDate !== null) {
    const day = formatDateOnly(futureDate, language)
    return t(`Auto-logs on ${day} at ${at}`, `Tự log ngày ${day} lúc ${at}`)
  }
  const left = formatMinutes(minutesLeft)
  return t(`Auto-logs at ${at} (${left} left)`, `Tự log lúc ${at} (còn ${left})`)
}

function failedSides(outcome: EntryOutcome): readonly { side: string; step: StepOutcome }[] {
  return [
    { side: 'TSC', step: outcome.tsc },
    { side: 'HRM', step: outcome.hrm },
  ].filter((item) => item.step.status === 'failed')
}

export interface StatusLine {
  readonly tone: 'ok' | 'danger'
  readonly text: string
  readonly detail: string | null
}

export function entryStatus(outcome: EntryOutcome, language: Language): StatusLine {
  const failed = failedSides(outcome)
  const day = dateLabel(outcome.date, language)
  if (failed.length === 0) {
    const text = t(`Logged ${day} ${DONE_MARK}`, `Đã log ${day} ${DONE_MARK}`)
    return { tone: 'ok', text, detail: null }
  }
  const parts = failed.map(({ side, step }) =>
    step.status === 'failed' ? `${side}: ${errorText(step.error)}` : side,
  )
  const details = failed.flatMap(({ step }) =>
    step.status === 'failed' && step.detail !== null ? [step.detail] : [],
  )
  return {
    tone: 'danger',
    text: `${day} - ${parts.join('; ')}`,
    detail: details.length === 0 ? null : details.join('\n'),
  }
}

export function runStatus(summary: RunSummary, language: Language): StatusLine {
  switch (summary.kind) {
    case 'drained': {
      const text =
        summary.kept.length === 0
          ? t(`${String(summary.logged)} logged`, `Đã log ${String(summary.logged)}`)
          : t(
              `${String(summary.logged)} logged, ${String(summary.kept.length)} kept for retry`,
              `Đã log ${String(summary.logged)}, giữ lại ${String(summary.kept.length)} để thử lại`,
            )
      const lines = summary.kept.map((outcome) => entryStatus(outcome, language))
      const detail = lines.map((line) => [line.text, line.detail].join(' ')).join('\n')
      return { tone: summary.kept.length === 0 ? 'ok' : 'danger', text, detail: detail || null }
    }
    case 'joined':
      return {
        tone: 'ok',
        text: t('A log run is already in progress', 'Đang có một lượt log'),
        detail: null,
      }
    case 'notConfigured':
      return { tone: 'danger', text: errorText({ code: 'timesheetNotConfigured' }), detail: null }
    default:
      return { tone: 'ok', text: t('Nothing is due yet', 'Chưa có gì tới hạn'), detail: null }
  }
}

export { DONE_MARK }
