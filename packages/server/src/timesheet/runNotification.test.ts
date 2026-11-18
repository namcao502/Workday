import type { EntryOutcome, RunSummary } from '@workday/core'
import { describe, expect, it } from 'vitest'
import { runNotice } from './runNotification.js'

const AT = '2026-11-18T11:00:20.000Z'
const KEPT: EntryOutcome = {
  date: '2026-11-18',
  tsc: { status: 'failed', error: { code: 'tscNoToken' }, detail: null },
  hrm: { status: 'ok' },
}

function drained(
  logged: number,
  kept: number,
  timedOut = false,
  trigger: RunSummary['trigger'] = 'schedule',
): RunSummary {
  const keptOutcomes = Array.from({ length: kept }, () => KEPT)
  return { at: AT, trigger, kind: 'drained', logged, kept: keptOutcomes, timedOut }
}

describe('runNotice', () => {
  it('the 18:00 run that logged everything is a success notice opening the timesheet', () => {
    expect(runNotice(drained(2, 0))).toEqual({
      topic: 'log',
      tone: 'success',
      event: { type: 'logRun', logged: 2, kept: 0, timedOut: false },
      target: { kind: 'timesheet' },
      place: 'timesheet',
    })
  })

  it('a run that kept days or timed out is an error notice, the catch-up included', () => {
    expect(runNotice(drained(1, 1))?.tone).toBe('error')
    expect(runNotice(drained(0, 2, true, 'catchUp'))).toMatchObject({
      tone: 'error',
      event: { type: 'logRun', logged: 0, kept: 2, timedOut: true },
    })
  })

  it('the reminder is an info notice', () => {
    expect(runNotice({ at: AT, trigger: 'schedule', kind: 'reminder' })).toMatchObject({
      tone: 'info',
      event: { type: 'logReminder' },
    })
  })

  it('a run the user started, and the quiet outcomes, add no notice', () => {
    expect(runNotice(drained(2, 0, false, 'user'))).toBeNull()
    for (const kind of ['weekend', 'dayOff', 'nothingDue', 'notConfigured', 'joined'] as const) {
      expect(runNotice({ at: AT, trigger: 'schedule', kind })).toBeNull()
    }
  })
})
