import {
  coreText,
  zonedClock,
  type RunSummary,
  type WeekReviewItem,
  type WorkdayConfig,
} from '@workday/core'
import type { NoticeInput } from '../notices/noticeService.js'
import type { PushMessage } from '../remote/pushService.js'

const TITLE = 'Workday'
const TIMESHEET_URL = '/#/timesheet'

// Null when the run is not worth a push: only the reminder and a drain that kept days are.
export function runPushMessage(
  summary: RunSummary,
  language: WorkdayConfig['language'],
  timeZone: string,
): PushMessage | null {
  const date = zonedClock(timeZone, new Date(summary.at)).date
  // Push does not pass through the client, so its text comes from core's i18n files.
  if (summary.kind === 'reminder') {
    return {
      title: TITLE,
      body: coreText(language, 'push.logReminder'),
      url: TIMESHEET_URL,
      tag: `log-reminder-${date}`,
    }
  }
  if (summary.kind === 'drained' && summary.kept.length !== 0) {
    return {
      title: TITLE,
      body: coreText(language, 'push.logDrained', {
        logged: summary.logged,
        kept: summary.kept.length,
      }),
      url: TIMESHEET_URL,
      tag: `log-drain-${date}`,
    }
  }
  return null
}

export function testPushMessage(language: WorkdayConfig['language']): PushMessage {
  return { title: TITLE, body: coreText(language, 'push.test'), url: '/', tag: 'test-push' }
}

// The Friday look back: one notice listing what to check, opening the Timesheet page.
export function weekReviewNotice(items: readonly WeekReviewItem[]): NoticeInput {
  return {
    topic: 'log',
    tone: 'error',
    event: { type: 'weekReview', items },
    target: { kind: 'timesheet' },
    place: 'timesheet',
  }
}

// The bell, toast and desktop notice for a run, like the C# app's auto-log balloon: the 18:00 run and the
// catch-up after it, and the reminder. A run the user started shows its result on the page instead.
export function runNotice(summary: RunSummary): NoticeInput | null {
  if (summary.trigger === 'user') {
    return null
  }
  const where = { target: { kind: 'timesheet' }, place: 'timesheet' } as const
  if (summary.kind === 'reminder') {
    return { topic: 'log', tone: 'info', event: { type: 'logReminder' }, ...where }
  }
  if (summary.kind !== 'drained') {
    return null
  }
  const kept = summary.kept.length
  return {
    topic: 'log',
    tone: kept === 0 && !summary.timedOut ? 'success' : 'error',
    event: { type: 'logRun', logged: summary.logged, kept, timedOut: summary.timedOut },
    ...where,
  }
}
