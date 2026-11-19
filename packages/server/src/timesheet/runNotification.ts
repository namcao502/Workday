import { zonedClock, type RunSummary, type WeekReviewItem, type WorkdayConfig } from '@workday/core'
import type { NoticeInput } from '../notices/noticeService.js'
import type { PushMessage } from '../remote/pushService.js'

const TITLE = 'Workday'
const TIMESHEET_URL = '/#/timesheet'

interface RunText {
  readonly reminder: string
  readonly drained: (logged: number, kept: number) => string
}

// Push does not pass through the client, so the server holds its own two texts per language.
const TEXTS: Readonly<Record<WorkdayConfig['language'], RunText>> = {
  en: {
    reminder: 'Nothing is queued for today - log your work before you leave.',
    drained: (logged, kept) =>
      `Auto-log: ${String(logged)} logged, ${String(kept)} kept for retry.`,
  },
  vi: {
    reminder: 'Hôm nay chưa có gì trong hàng đợi - hãy log công việc trước khi ra về.',
    drained: (logged, kept) =>
      `Tự log: đã log ${String(logged)}, giữ lại ${String(kept)} để thử lại.`,
  },
}

// Null when the run is not worth a push: only the reminder and a drain that kept days are.
export function runPushMessage(
  summary: RunSummary,
  language: WorkdayConfig['language'],
  timeZone: string,
): PushMessage | null {
  const date = zonedClock(timeZone, new Date(summary.at)).date
  const text = TEXTS[language]
  if (summary.kind === 'reminder') {
    return { title: TITLE, body: text.reminder, url: TIMESHEET_URL, tag: `log-reminder-${date}` }
  }
  if (summary.kind === 'drained' && summary.kept.length !== 0) {
    return {
      title: TITLE,
      body: text.drained(summary.logged, summary.kept.length),
      url: TIMESHEET_URL,
      tag: `log-drain-${date}`,
    }
  }
  return null
}

const TEST_BODY: Readonly<Record<WorkdayConfig['language'], string>> = {
  en: 'Notifications are working on this device.',
  vi: 'Thông báo đã hoạt động trên thiết bị này.',
}

export function testPushMessage(language: WorkdayConfig['language']): PushMessage {
  return { title: TITLE, body: TEST_BODY[language], url: '/', tag: 'test-push' }
}

// The bell, toast and desktop notice for a run, like the C# app's auto-log balloon: the 18:00 run and the
// catch-up after it, and the reminder. A run the user started shows its result on the page instead.
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
