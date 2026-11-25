import { describe, expect, it } from 'vitest'
import { describeSlots, evenSplit, moveBoundary, slotsFor, type TimeSlot } from './timeSlots.js'

function toMinutes(hhmm: string): number {
  const [hours = 0, minutes = 0] = hhmm.split(':').map(Number)
  return hours * 60 + minutes
}

function totalMinutes(slots: readonly TimeSlot[]): number {
  return slots.reduce((sum, slot) => sum + toMinutes(slot.end) - toMinutes(slot.start), 0)
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

describe('describeSlots', () => {
  it('reads the slots in twelve-hour time', () => {
    expect(
      describeSlots([
        { start: '09:00', end: '12:00' },
        { start: '13:00', end: '14:00' },
      ]),
    ).toBe('9:00 AM - 12:00 PM, 1:00 PM - 2:00 PM')
    expect(describeSlots([{ start: '14:00', end: '18:00' }])).toBe('2:00 PM - 6:00 PM')
  })
})

describe('slotsFor with an even split', () => {
  it('returns the full day for one ticket', () => {
    const slots = slotsFor(evenSplit(1), 0)
    expect(slots).toEqual([
      { start: '09:00', end: '12:00' },
      { start: '13:00', end: '18:00' },
    ])
    expect(totalMinutes(slots)).toBe(480)
  })

  it('splits two tickets evenly', () => {
    const minutes = evenSplit(2)
    expect(slotsFor(minutes, 0)).toEqual([
      { start: '09:00', end: '12:00' },
      { start: '13:00', end: '14:00' },
    ])
    expect(slotsFor(minutes, 1)).toEqual([{ start: '14:00', end: '18:00' }])
  })

  it('splits three tickets evenly', () => {
    const minutes = evenSplit(3)
    const durations = [0, 1, 2].map((index) => totalMinutes(slotsFor(minutes, index)))
    expect(durations).toEqual([160, 160, 160])
  })

  it('splits four tickets evenly', () => {
    const minutes = evenSplit(4)
    const durations = [0, 1, 2, 3].map((index) => totalMinutes(slotsFor(minutes, index)))
    expect(durations).toEqual([120, 120, 120, 120])
  })

  it('splits five tickets approximately evenly', () => {
    const minutes = evenSplit(5)
    const durations = [0, 1, 2, 3, 4].map((index) => totalMinutes(slotsFor(minutes, index)))
    expect(sum(durations)).toBe(480)
    for (const duration of durations) {
      expect(duration).toBeGreaterThanOrEqual(90)
      expect(duration).toBeLessThanOrEqual(105)
    }
  })

  it('splits a lunch-straddling slot into two rows', () => {
    const slots = slotsFor(evenSplit(2), 0)
    expect(slots).toHaveLength(2)
    expect(slots[0]?.end).toBe('12:00')
    expect(slots[1]?.start).toBe('13:00')
  })

  it('rounds times to five-minute boundaries', () => {
    for (let count = 1; count <= 5; count += 1) {
      for (let index = 0; index < count; index += 1) {
        for (const slot of slotsFor(evenSplit(count), index)) {
          expect(toMinutes(slot.start) % 5).toBe(0)
          expect(toMinutes(slot.end) % 5).toBe(0)
        }
      }
    }
  })

  it('covers the full workday with no gaps for three tickets', () => {
    const minutes = evenSplit(3)
    const flat = [0, 1, 2].flatMap((index) => slotsFor(minutes, index))
    expect(flat[0]?.start).toBe('09:00')
    expect(flat[flat.length - 1]?.end).toBe('18:00')
    for (let index = 1; index < flat.length; index += 1) {
      const previousEnd = flat[index - 1]?.end
      expect(flat[index]?.start).toBe(previousEnd === '12:00' ? '13:00' : previousEnd)
    }
  })
})

describe('slotsFor with custom minutes', () => {
  it('lays out six then two hours', () => {
    const minutes = [360, 120]
    expect(slotsFor(minutes, 0)).toEqual([
      { start: '09:00', end: '12:00' },
      { start: '13:00', end: '16:00' },
    ])
    expect(slotsFor(minutes, 1)).toEqual([{ start: '16:00', end: '18:00' }])
  })

  it('stops early on a partial day without swallowing lunch', () => {
    const minutes = [180, 120]
    expect(slotsFor(minutes, 0)).toEqual([{ start: '09:00', end: '12:00' }])
    expect(slotsFor(minutes, 1)).toEqual([{ start: '13:00', end: '15:00' }])
  })
})

describe('evenSplit', () => {
  it('gives the remainder to the last ticket and always fills the day', () => {
    expect(evenSplit(2)).toEqual([240, 240])
    expect(evenSplit(7)).toEqual([68, 68, 68, 68, 68, 68, 72])
    for (let count = 1; count <= 5; count += 1) {
      expect(sum(evenSplit(count))).toBe(480)
    }
  })
})

describe('moveBoundary', () => {
  it('trades time with the next ticket, snapped to half hours', () => {
    expect(moveBoundary([240, 240], 0, 160)).toEqual([150, 330])
  })

  it('trades the last ticket with the free time, up to 8h', () => {
    expect(moveBoundary([120, 180], 1, 420)).toEqual([120, 300])
    expect(moveBoundary([120, 180], 1, 600)).toEqual([120, 360])
  })

  it('keeps every ticket at least half an hour', () => {
    expect(moveBoundary([240, 240], 0, 0)).toEqual([30, 450])
    expect(moveBoundary([240, 240], 0, 480)).toEqual([450, 30])
  })

  it('does not mutate its input', () => {
    const minutes = [240, 240]
    moveBoundary(minutes, 0, 160)
    expect(minutes).toEqual([240, 240])
  })
})
