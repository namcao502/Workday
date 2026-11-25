const MORNING_START = 9 * 60
const MORNING_END = 12 * 60
const AFTERNOON_START = 13 * 60
const AFTERNOON_END = 18 * 60
const MORNING_MINUTES = MORNING_END - MORNING_START
const ROUND_MINUTES = 5

export const WORK_MINUTES = MORNING_MINUTES + (AFTERNOON_END - AFTERNOON_START)
export const HRM_OPENS_AT_MINUTES = AFTERNOON_END
export const HOURS_STEP_MINUTES = 30

export interface TimeSlot {
  readonly start: string // "HH:mm"
  readonly end: string
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function minutesToTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

// Half rounds up, like JS Math.round; every input is positive.
function roundTo5(minutes: number): number {
  return Math.round(minutes / ROUND_MINUTES) * ROUND_MINUTES
}

// Matches C# Math.Round's default, which the drag snap was written against: x.5 goes to the even neighbour.
function roundHalfToEven(value: number): number {
  const floor = Math.floor(value)
  const fraction = value - floor
  if (fraction === 0.5) {
    return floor % 2 === 0 ? floor : floor + 1
  }
  return Math.round(value)
}

function slot(startClock: number, endClock: number): TimeSlot {
  return { start: minutesToTime(roundTo5(startClock)), end: minutesToTime(roundTo5(endClock)) }
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

// Uniform minutes; the last ticket absorbs the remainder so the day ends exactly at 18:00.
export function evenSplit(ticketCount: number): readonly number[] {
  const each = Math.floor(WORK_MINUTES / ticketCount)
  return Array.from({ length: ticketCount }, (_, index) =>
    index === ticketCount - 1 ? WORK_MINUTES - each * (ticketCount - 1) : each,
  )
}

// Work minutes 0 = 09:00, 180 = lunch, 480 = 18:00. The 180 mark reads 12:00 as an end and 13:00 as a start.
function segmentsFor(startOffset: number, endOffset: number): readonly TimeSlot[] {
  if (endOffset <= MORNING_MINUTES) {
    return [slot(MORNING_START + startOffset, MORNING_START + endOffset)]
  }
  if (startOffset >= MORNING_MINUTES) {
    return [
      slot(
        AFTERNOON_START + startOffset - MORNING_MINUTES,
        AFTERNOON_START + endOffset - MORNING_MINUTES,
      ),
    ]
  }
  return [
    slot(MORNING_START + startOffset, MORNING_END),
    slot(AFTERNOON_START, AFTERNOON_START + endOffset - MORNING_MINUTES),
  ]
}

// One ticket's slots, laid out from 09:00 skipping lunch; a day that is not full just stops early.
export function slotsFor(
  minutesPerTicket: readonly number[],
  ticketIndex: number,
): readonly TimeSlot[] {
  const startOffset = sum(minutesPerTicket.slice(0, ticketIndex))
  const endOffset = startOffset + (minutesPerTicket[ticketIndex] ?? 0)
  return segmentsFor(startOffset, endOffset)
}

function clock12(hhmm: string): string {
  const [hours = 0, minutes = 0] = hhmm.split(':').map(Number)
  const suffix = hours < 12 ? 'AM' : 'PM'
  return `${String(hours % 12 === 0 ? 12 : hours % 12)}:${pad(minutes)} ${suffix}`
}

// "9:00 AM - 12:00 PM, 1:00 PM - 2:00 PM"
export function describeSlots(slots: readonly TimeSlot[]): string {
  return slots.map((item) => `${clock12(item.start)} - ${clock12(item.end)}`).join(', ')
}

// Boundary k sits after ticket k; the last boundary trades time with the day's free time.
export function moveBoundary(
  minutes: readonly number[],
  boundaryIndex: number,
  boundaryMinutes: number,
): readonly number[] {
  const ends = minutes.map((_, index) => sum(minutes.slice(0, index + 1)))
  const start = boundaryIndex === 0 ? 0 : (ends[boundaryIndex - 1] ?? 0)
  const isLast = boundaryIndex === minutes.length - 1
  const lowest = start + HOURS_STEP_MINUTES
  const highest = isLast
    ? WORK_MINUTES
    : (ends[boundaryIndex + 1] ?? WORK_MINUTES) - HOURS_STEP_MINUTES
  const snapped = roundHalfToEven(boundaryMinutes / HOURS_STEP_MINUTES) * HOURS_STEP_MINUTES
  const boundary = Math.min(Math.max(snapped, lowest), Math.max(lowest, highest))

  return minutes.map((value, index) => {
    if (index === boundaryIndex) {
      return boundary - start
    }
    if (!isLast && index === boundaryIndex + 1) {
      return (ends[boundaryIndex + 1] ?? 0) - boundary
    }
    return value
  })
}
