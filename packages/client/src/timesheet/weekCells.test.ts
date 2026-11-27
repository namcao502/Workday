import type { LogDayView } from '@workday/core'
import { expect, it } from 'vitest'
import { coverage, queued } from './timesheetTestSupport.js'
import { hrmCell, missingDays, todayNeeds, tscCell } from './weekCells.js'

const TODAY = '2026-11-12'

function day(date: string, overrides: Partial<LogDayView> = {}): LogDayView {
  return { date, state: 'empty', coverage: coverage(date), queued: null, ...overrides }
}

it('a full day is green, a short past day red, today and the future wait', () => {
  expect(
    hrmCell(day('2026-11-11', { coverage: coverage('2026-11-11', { hrmHours: 8 }) }), TODAY),
  ).toMatchObject({ tone: 'ok', text: '✓ 8h' })
  expect(
    hrmCell(day('2026-11-11', { coverage: coverage('2026-11-11', { hrmHours: 4 }) }), TODAY),
  ).toMatchObject({ tone: 'miss', text: '4h / 8h' })
  expect(hrmCell(day(TODAY), TODAY).tone).toBe('wait')
  expect(hrmCell(day('2026-11-13', { state: 'future', coverage: null }), TODAY).tone).toBe('none')
})

it('an off day reads as leave or the holiday name in both rows', () => {
  const leave = day('2026-11-10', {
    coverage: coverage('2026-11-10', { isOff: true, tscText: 'OFF' }),
  })
  expect(hrmCell(leave, TODAY)).toMatchObject({ tone: 'off', text: 'Leave', short: 'Off' })
  expect(tscCell(leave, TODAY)).toMatchObject({ tone: 'off', text: 'OFF' })
  const holiday = day('2026-11-24', {
    coverage: coverage('2026-11-24', { isOff: true, holiday: { date: '11-24', name: null } }),
  })
  expect(hrmCell(holiday, '2026-11-27').text).toBe('Vietnam Culture Day')
})

it('TSC text is done, a TSC that was not read says nothing, a queued day waits', () => {
  expect(
    tscCell(day('2026-11-11', { coverage: coverage('2026-11-11', { tscText: 'MDP-1' }) }), TODAY),
  ).toMatchObject({ tone: 'ok', text: '✓ MDP-1', short: '✓' })
  expect(
    tscCell(day('2026-11-11', { coverage: coverage('2026-11-11', { tscState: 'failed' }) }), TODAY)
      .tone,
  ).toBe('none')
  expect(tscCell(day('2026-11-11'), TODAY)).toMatchObject({ tone: 'miss', text: 'Empty' })
  const waiting = day(TODAY, { state: 'queued', queued: queued(TODAY) })
  expect(hrmCell(waiting, TODAY)).toMatchObject({ tone: 'wait', text: 'Queued 8h' })
  expect(tscCell(waiting, TODAY).tone).toBe('wait')
})

it('lists the past days still short and what today needs', () => {
  const days = [
    day('2026-11-10', { coverage: coverage('2026-11-10', { hrmHours: 8 }) }),
    day('2026-11-11', { coverage: coverage('2026-11-11', { hrmHours: 8, tscText: 'MDP-1' }) }),
    day(TODAY, { coverage: coverage(TODAY, { hrmHours: 2 }) }),
  ]
  expect(missingDays(days, TODAY, (date) => date.slice(8))).toEqual(['10 (TSC)'])
  expect(todayNeeds(days, TODAY)).toBe('HRM 6h, TSC')
  expect(todayNeeds([day(TODAY, { queued: queued(TODAY) })], TODAY)).toBeNull()
  expect(todayNeeds(days, '2026-11-20')).toBeNull()
})
