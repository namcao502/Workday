import { describe, expect, it } from 'vitest'
import type { ZonedClock } from './zonedDate.js'
import {
  addTickets,
  dayMinutes,
  entryMinutes,
  isHrmClosed,
  isTodayDue,
  mergeInto,
  minutesUntilRun,
  minutesWith,
  queueDayState,
  removeLogged,
  removeTicket,
  setMinutes,
  type QueueEntry,
} from './timesheetQueue.js'

const DAY = '2026-07-24'

function entry(
  tickets: readonly string[],
  minutes: readonly number[] | null = null,
  date = DAY,
): QueueEntry {
  return { date, tickets, minutes }
}

describe('minutesWith', () => {
  const evenSplit = entry(['MDP-1', 'MDP-2'])
  const custom = entry(['MDP-1', 'MDP-2'], [300, 180])

  it('changes one ticket share, making an even split concrete first', () => {
    expect(minutesWith(evenSplit, 'MDP-1', 120)).toEqual([120, 240])
    expect(minutesWith(custom, 'MDP-2', 120)).toEqual([300, 120])
  })

  it('refuses a zero share, an overfull day and an unknown ticket', () => {
    expect(minutesWith(evenSplit, 'MDP-1', 0)).toBeNull()
    expect(minutesWith(evenSplit, 'MDP-1', 300)).toBeNull()
    expect(minutesWith(evenSplit, 'MDP-9', 60)).toBeNull()
  })
})

describe('setMinutes', () => {
  it('saves each share in the entry order when the entry holds exactly those tickets', () => {
    const queue = [entry(['MDP-1', 'MDP-2'])]
    const result = setMinutes(queue, DAY, ['MDP-2', 'MDP-1'], [90, 390])
    expect(result).toEqual([entry(['MDP-1', 'MDP-2'], [390, 90])])
    expect(queue[0]?.minutes).toBeNull()
  })

  it('returns null when another ticket joined meanwhile or the date is missing', () => {
    const queue = [entry(['MDP-1', 'MDP-2', 'MDP-3'])]
    expect(setMinutes(queue, DAY, ['MDP-1', 'MDP-2'], [240, 240])).toBeNull()
    expect(setMinutes(queue, '2026-07-25', ['MDP-1'], [480])).toBeNull()
  })

  it('throws when tickets and minutes differ in length', () => {
    expect(() => setMinutes([entry(['MDP-1'])], DAY, ['MDP-1'], [1, 2])).toThrow()
  })
})

describe('addTickets', () => {
  it('merges into an existing day', () => {
    const outcome = addTickets([entry(['MDP-1'])], DAY, ['MDP-1', 'MDP-2'], null)
    expect(outcome).toEqual({ status: 'merged', queue: [entry(['MDP-1', 'MDP-2'])] })
  })

  it('adds a new day in date order', () => {
    const outcome = addTickets([entry(['MDP-1'], null, '2026-07-25')], DAY, ['MDP-2'], null)
    expect(outcome.status).toBe('added')
    if (outcome.status === 'added') {
      expect(outcome.queue.map((queued) => queued.date)).toEqual([DAY, '2026-07-25'])
    }
  })

  it('refuses a day over eight hours', () => {
    const outcome = addTickets([entry(['MDP-1'], [400])], DAY, ['MDP-2'], [120])
    expect(outcome).toEqual({ status: 'overEightHours' })
  })

  it('refuses an invalid ticket or an empty list', () => {
    expect(addTickets([], DAY, ['MDP-1', 'nope'], null)).toEqual({ status: 'invalidTicket' })
    expect(addTickets([], DAY, [], null)).toEqual({ status: 'invalidTicket' })
  })
})

describe('removeLogged', () => {
  it('drops only the processed tickets and whole days left empty', () => {
    const queue = [entry(['MDP-1', 'MDP-2']), entry(['MDP-3'], null, '2026-07-25')]
    const result = removeLogged(queue, [entry(['MDP-1']), entry(['MDP-3'], null, '2026-07-25')])
    expect(result).toEqual([entry(['MDP-2'])])
  })

  it('keeps minutes in lockstep with the surviving tickets', () => {
    const queue = [entry(['MDP-1', 'MDP-2', 'MDP-3'], [120, 180, 180])]
    expect(removeLogged(queue, [entry(['MDP-2'])])).toEqual([entry(['MDP-1', 'MDP-3'], [120, 180])])
  })

  it('keeps entries queued during a drain', () => {
    const queue = [entry(['MDP-1']), entry(['MDP-9'], null, '2026-07-26')]
    expect(removeLogged(queue, [entry(['MDP-1'])])).toEqual([entry(['MDP-9'], null, '2026-07-26')])
  })

  it('returns the queue unchanged when nothing was processed', () => {
    const queue = [entry(['MDP-1'])]
    expect(removeLogged(queue, [])).toEqual(queue)
  })
})

describe('mergeInto', () => {
  it('appends new tickets and dedupes, staying an even split', () => {
    const merged = mergeInto(entry(['MDP-1', 'MDP-2']), ['MDP-2', 'MDP-3'], null)
    expect(merged.tickets).toEqual(['MDP-1', 'MDP-2', 'MDP-3'])
    expect(merged.minutes).toBeNull()
  })

  it('materializes minutes when the existing entry is custom', () => {
    const merged = mergeInto(entry(['MDP-1', 'MDP-2'], [300, 60]), ['MDP-3'], null)
    expect(merged.minutes).toEqual([300, 60, 480])
  })

  it('materializes minutes when the new side is custom', () => {
    const merged = mergeInto(entry(['MDP-1', 'MDP-2']), ['MDP-3'], [120])
    expect(merged.tickets).toEqual(['MDP-1', 'MDP-2', 'MDP-3'])
    expect(merged.minutes).toEqual([240, 240, 120])
  })
})

describe('dayMinutes', () => {
  it('is a full day for an even split and the sum for a custom entry', () => {
    expect(dayMinutes(entry(['MDP-1', 'MDP-2', 'MDP-3']))).toBe(480)
    const within = entry(['MDP-1', 'MDP-2'], [300, 180])
    expect(dayMinutes(within)).toBe(480)
    expect(dayMinutes(mergeInto(within, ['MDP-3'], [120]))).toBe(600)
  })

  it('entryMinutes falls back to the even split', () => {
    expect(entryMinutes(entry(['MDP-1', 'MDP-2']))).toEqual([240, 240])
    expect(entryMinutes(entry(['MDP-1'], [100]))).toEqual([100])
  })
})

describe('removeTicket', () => {
  it('drops only that ticket, keeping the others', () => {
    expect(removeTicket([entry(['MDP-1', 'MDP-2'])], DAY, 'MDP-1')).toEqual([entry(['MDP-2'])])
  })

  it('drops the date when the last ticket is removed', () => {
    expect(removeTicket([entry(['MDP-1'])], DAY, 'MDP-1')).toEqual([])
  })
})

describe('queueDayState', () => {
  const today = '2026-11-04'
  const sixPm = 1080

  function at(hour: number, minute = 0): ZonedClock {
    return { date: today, minutes: hour * 60 + minute, weekday: 3 }
  }

  it('makes today wait until the run, a past day due and a future day wait', () => {
    expect(queueDayState(today, at(17, 59), sixPm)).toBe('waiting')
    expect(queueDayState(today, at(18), sixPm)).toBe('due')
    expect(queueDayState('2026-11-03', at(9), sixPm)).toBe('due')
    expect(queueDayState('2026-11-05', at(20), sixPm)).toBe('waiting')
  })

  it('counts down to the later of the log time and 6 PM', () => {
    expect(minutesUntilRun(at(15, 45), sixPm)).toBe(135)
    expect(minutesUntilRun(at(18, 30), sixPm)).toBe(0)
    expect(minutesUntilRun(at(15), 17 * 60)).toBe(180)
  })

  it('isTodayDue waits for 18:00 even when the log time is earlier', () => {
    expect(isTodayDue(at(17, 59), 9 * 60)).toBe(false)
    expect(isTodayDue(at(18), 9 * 60)).toBe(true)
    expect(isTodayDue(at(18, 30), 19 * 60)).toBe(false)
  })

  it('isHrmClosed is true for today before 18:00 only', () => {
    expect(isHrmClosed(today, at(17, 59))).toBe(true)
    expect(isHrmClosed(today, at(18))).toBe(false)
    expect(isHrmClosed('2026-11-03', at(9))).toBe(false)
    expect(isHrmClosed('2026-11-05', at(9))).toBe(false)
  })
})
