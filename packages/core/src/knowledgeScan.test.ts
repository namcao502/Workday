import { describe, expect, it } from 'vitest'
import type { KnowledgeScanConfig } from './api.js'
import {
  judgeRun,
  nextRunAt,
  scanCounts,
  scanProblemLines,
  startTimeChoices,
} from './knowledgeScan.js'

const CONFIG: KnowledgeScanConfig = {
  enabled: true,
  command: 'pwsh',
  args: [],
  day: 'daily',
  time: '07:00',
  limitHours: 2,
  logFile: null,
}
const ZONE = 'Asia/Ho_Chi_Minh'

describe('scanProblemLines', () => {
  it('takes problems only from the scripts own lines', () => {
    const lines = [
      '2026-10-14 07:00:01 Found 2 ticket(s) in the last 1440 minute(s): MDP-1, MDP-2',
      '2026-10-14 07:00:02 Mining MDP-1 ...',
      '2026-10-14 07:00:30   FAILED (exit 1): {"is_error":true}',
      '2026-10-14 07:00:31   Giving up on MDP-1 after 3 failed attempts',
      '2026-10-14 07:01:00   Fixed the failed login flow',
      '2026-10-14 07:01:05 ERROR: git fetch origin failed',
    ]
    expect(scanProblemLines(lines)).toEqual([
      'FAILED (exit 1): {"is_error":true}',
      'Giving up on MDP-1 after 3 failed attempts',
      'ERROR: git fetch origin failed',
    ])
  })

  it('reads lines that carry no timestamp', () => {
    expect(scanProblemLines(['ERROR: Jira query failed: boom', 'fine'])).toEqual([
      'ERROR: Jira query failed: boom',
    ])
  })
})

describe('scanCounts', () => {
  it('counts tickets found, mined and maps refreshed', () => {
    const lines = [
      '2026-10-14 07:00:01 Found 3 ticket(s) in the last 60 minute(s): A-1, A-2, A-3',
      '2026-10-14 07:00:02 Mining A-1 ...',
      '2026-10-14 07:00:03   Mined A-1 ... done',
      '2026-10-14 07:01:02 Mining A-2 ...',
      '2026-10-14 07:02:00 Refreshing map backend [Backend] (a..b, 2 cited file(s) changed) ...',
      '2026-10-14 07:03:00 Daily knowledge scan complete.',
    ]
    expect(scanCounts(lines)).toEqual({ found: 3, mined: 2, refreshed: 1 })
  })

  it('is zero for an empty output', () => {
    expect(scanCounts([])).toEqual({ found: 0, mined: 0, refreshed: 0 })
  })
})

describe('judgeRun', () => {
  it('tells the outcomes apart', () => {
    expect(judgeRun(0, false, [])).toBe('ok')
    expect(judgeRun(0, false, ['ERROR: x'])).toBe('withProblems')
    expect(judgeRun(1, false, [])).toBe('failed')
    expect(judgeRun(null, false, [])).toBe('failed')
    expect(judgeRun(1, true, ['ERROR: x'])).toBe('stopped')
  })
})

describe('startTimeChoices', () => {
  it('is the hours from 06:00 to 23:00', () => {
    const choices = startTimeChoices(null)
    expect(choices).toHaveLength(18)
    expect(choices[0]).toBe('06:00')
    expect(choices[17]).toBe('23:00')
  })

  it('adds the configured time in order when the hours lack it', () => {
    const choices = startTimeChoices('07:30')
    expect(choices.slice(0, 3)).toEqual(['06:00', '07:00', '07:30'])
    expect(startTimeChoices('07:00')).toHaveLength(18)
  })
})

describe('nextRunAt', () => {
  it("picks today's time when still ahead, else the next matching day", () => {
    // 2026-10-14 is a Wednesday; 06:00 UTC is 13:00 in Ho Chi Minh.
    const now = new Date('2026-10-14T06:00:00Z')
    expect(nextRunAt({ ...CONFIG, time: '14:00' }, ZONE, now)?.toISOString()).toBe(
      '2026-10-14T07:00:00.000Z',
    )
    expect(nextRunAt({ ...CONFIG, time: '12:00' }, ZONE, now)?.toISOString()).toBe(
      '2026-10-15T05:00:00.000Z',
    )
    expect(nextRunAt({ ...CONFIG, time: '12:00', day: 'mon' }, ZONE, now)?.toISOString()).toBe(
      '2026-10-19T05:00:00.000Z',
    )
    expect(nextRunAt({ ...CONFIG, time: '12:00', day: 'wed' }, ZONE, now)?.toISOString()).toBe(
      '2026-10-21T05:00:00.000Z',
    )
  })

  it('follows the zones daylight saving offset', () => {
    // New York is UTC-4 on 2026-10-14 and UTC-5 after the 1 Nov change.
    const config = { ...CONFIG, time: '09:00' }
    expect(
      nextRunAt(config, 'America/New_York', new Date('2026-10-14T00:00:00Z'))?.toISOString(),
    ).toBe('2026-10-14T13:00:00.000Z')
    expect(
      nextRunAt(config, 'America/New_York', new Date('2026-11-02T00:00:00Z'))?.toISOString(),
    ).toBe('2026-11-02T14:00:00.000Z')
  })

  it('is null when the scan is off', () => {
    expect(nextRunAt({ ...CONFIG, enabled: false }, ZONE, new Date())).toBeNull()
  })
})
