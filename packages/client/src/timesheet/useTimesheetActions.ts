import { useState } from 'react'
import {
  addToQueue,
  clearQueue,
  drainQueue,
  logNow,
  logOff,
  removeFromQueue,
  setQueueMinutes,
  type LogTarget,
} from '../api/client.js'
import { useRefreshTimesheet } from '../api/useTimesheet.js'
import { errorText } from '../errors.js'
import { t, type Language } from '../i18n.js'
import type { LogAction } from './LogInput.js'
import { dateLabel, entryStatus, runStatus, type StatusLine } from './timesheetText.js'

export interface Working {
  readonly action: LogAction | 'drain' | 'save'
  readonly date: string
}

interface Typed {
  readonly date: string
  readonly tickets: readonly string[]
  readonly minutes: readonly number[] | null
}

export interface TimesheetActions {
  readonly status: StatusLine | null
  readonly working: Working | null
  readonly setStatus: (line: StatusLine | null) => void
  readonly addTyped: (typed: Typed, onDone: () => void) => Promise<void>
  readonly logTyped: (typed: Typed, target: LogTarget, onDone: () => void) => Promise<void>
  readonly logOffDay: (date: string) => Promise<void>
  readonly clear: () => Promise<void>
  readonly drainDay: (date: string) => Promise<void>
  readonly saveMinutes: (
    date: string,
    tickets: readonly string[],
    minutes: readonly number[],
  ) => Promise<void>
  readonly removeTicket: (date: string, key: string) => Promise<void>
}

function failure(text: string): StatusLine {
  return { tone: 'danger', text, detail: null }
}

// Runs one server call with a working flag; any result becomes the page's status line.
export function useTimesheetActions(language: Language): TimesheetActions {
  const refresh = useRefreshTimesheet()
  const [status, setStatus] = useState<StatusLine | null>(null)
  const [working, setWorking] = useState<Working | null>(null)

  async function run(next: Working, job: () => Promise<StatusLine | null>): Promise<void> {
    setWorking(next)
    setStatus(null)
    try {
      setStatus(await job())
    } catch {
      setStatus(failure(t('The request failed', 'Yêu cầu thất bại')))
    } finally {
      setWorking(null)
      await refresh()
    }
  }

  return {
    status,
    working,
    setStatus,
    addTyped: (typed, onDone) =>
      run({ action: 'add', date: typed.date }, async () => {
        const result = await addToQueue(typed)
        if (!result.ok) {
          return failure(errorText(result.error))
        }
        onDone()
        const count = String(typed.tickets.length)
        const day = dateLabel(typed.date, language)
        return {
          tone: 'ok',
          text: t(`Queued ${count} ticket(s) for ${day}`, `Đã thêm ${count} ticket cho ${day}`),
          detail: null,
        }
      }),
    logTyped: (typed, target, onDone) =>
      run({ action: target === 'both' ? 'now' : target, date: typed.date }, async () => {
        const result = await logNow({ ...typed, target })
        if (!result.ok) {
          return failure(errorText(result.error))
        }
        const line = entryStatus(result.outcome, language)
        if (line.tone === 'ok') {
          onDone()
        }
        return line
      }),
    logOffDay: (date) =>
      run({ action: 'off', date }, async () => entryStatus(await logOff(date), language)),
    clear: () =>
      run({ action: 'clear', date: '' }, async () => {
        await clearQueue()
        return { tone: 'ok', text: t('Queue cleared', 'Đã xóa hàng đợi'), detail: null }
      }),
    drainDay: (date) =>
      run({ action: 'drain', date }, async () => {
        const result = await drainQueue(date)
        return result.ok ? runStatus(result.summary, language) : failure(errorText(result.error))
      }),
    saveMinutes: (date, tickets, minutes) =>
      run({ action: 'save', date }, async () => {
        const result = await setQueueMinutes({ date, tickets, minutes })
        return result.ok ? null : failure(errorText(result.error))
      }),
    removeTicket: (date, key) =>
      run({ action: 'save', date }, async () => {
        await removeFromQueue(date, key)
        return null
      }),
  }
}
