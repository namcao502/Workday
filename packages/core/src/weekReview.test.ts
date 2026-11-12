import { describe, expect, it } from 'vitest'
import type { DayCoverage, HrmTask } from './timesheetWeek.js'
import { reviewWeek } from './weekReview.js'

const TUESDAY = '2026-10-20'
const WEDNESDAY = '2026-10-21'

function day(
  date: string,
  tscText: string | null,
  overrides: Partial<DayCoverage> = {},
): DayCoverage {
  return { date, hrmHours: 8, tscText, isOff: false, tscState: 'read', ...overrides }
}

function task(date: string, ticketKey: string, summary: string | null): HrmTask {
  return { date, ticketKey, summary, workingSeconds: 14400 }
}

function review(
  week: readonly DayCoverage[],
  hrmTasks: readonly HrmTask[] | null,
  mine: readonly string[],
  missing: readonly string[] = [],
) {
  return reviewWeek({
    week,
    hrmTasks,
    mineKeys: new Set(mine),
    missingKeys: new Set(missing),
    offMarker: 'OFF',
    projectKey: 'MDP',
  })
}

describe('reviewWeek', () => {
  it('flags a not-mine ticket with its suggestion', () => {
    const items = review(
      [day(TUESDAY, 'MDP-6798')],
      [task(TUESDAY, 'MDP-6798', "Someone else's ticket")],
      ['MDP-6789'],
    )
    expect(items).toEqual([
      {
        date: TUESDAY,
        ticketKey: 'MDP-6798',
        summary: "Someone else's ticket",
        issue: 'notMine',
        suggestedKey: 'MDP-6789',
      },
    ])
  })

  it('flags a not-found ticket', () => {
    const items = review(
      [day(TUESDAY, 'MDP-67989')],
      [task(TUESDAY, 'MDP-67989', null)],
      ['MDP-6798'],
      ['MDP-67989'],
    )
    expect(items).toHaveLength(1)
    expect(items[0]?.issue).toBe('notFound')
    expect(items[0]?.suggestedKey).toBe('MDP-6798')
  })

  it('flags tscOnly and hrmOnly when both sides were read', () => {
    const items = review(
      [day(WEDNESDAY, 'MDP-1, MDP-2')],
      [task(WEDNESDAY, 'MDP-2', 'Two'), task(WEDNESDAY, 'MDP-3', 'Three')],
      ['MDP-1', 'MDP-2', 'MDP-3'],
    )
    expect(items).toEqual([
      { date: WEDNESDAY, ticketKey: 'MDP-1', summary: null, issue: 'tscOnly', suggestedKey: null },
      {
        date: WEDNESDAY,
        ticketKey: 'MDP-3',
        summary: 'Three',
        issue: 'hrmOnly',
        suggestedKey: null,
      },
    ])
  })

  it('skips the TSC and HRM comparison when TSC was not read or the day is off', () => {
    const week = [
      day(TUESDAY, null, { tscState: 'noToken' }),
      day(WEDNESDAY, 'off', { isOff: true, hrmHours: 0 }),
    ]
    const hrm = [task(TUESDAY, 'MDP-1', 'One'), task(WEDNESDAY, 'MDP-1', 'One')]
    expect(review(week, hrm, ['MDP-1'])).toEqual([])
  })

  it('treats a TSC cell equal to the off marker as off, ignoring case', () => {
    const hrm = [task(TUESDAY, 'MDP-1', 'One')]
    expect(review([day(TUESDAY, ' off ')], hrm, ['MDP-1'])).toEqual([])
  })

  it('returns nothing when every ticket is mine and both sides match', () => {
    const hrm = [task(TUESDAY, 'MDP-1', 'One'), task(TUESDAY, 'MDP-2', 'Two')]
    expect(review([day(TUESDAY, 'MDP-1, MDP-2')], hrm, ['MDP-1', 'MDP-2'])).toEqual([])
  })

  it('checks only the TSC side when HRM was not read', () => {
    const items = review([day(TUESDAY, 'MDP-6798')], null, ['MDP-6789'])
    expect(items).toHaveLength(1)
    expect(items[0]?.issue).toBe('notMine')
  })
})
