import { join } from 'node:path'
import { isTicketKey, WORK_MINUTES, type QueueEntry } from '@workday/core'
import { isRecord, readJson, writeJsonAtomic } from '../jsonFile.js'

const QUEUE_FILE = 'queue.json'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Wrong length, a share <= 0 or a day over 8h falls back to the even split; the entry is kept.
function parseMinutes(raw: unknown, ticketCount: number): readonly number[] | null {
  if (!Array.isArray(raw) || raw.length !== ticketCount) {
    return null
  }
  const minutes = raw.filter(
    (value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0,
  )
  const total = minutes.reduce((sum, value) => sum + value, 0)
  return minutes.length === ticketCount && total <= WORK_MINUTES ? minutes : null
}

function parseEntry(raw: unknown): QueueEntry | null {
  if (!isRecord(raw)) {
    return null
  }
  const { date, tickets } = raw
  if (typeof date !== 'string' || !DATE_PATTERN.test(date) || !Array.isArray(tickets)) {
    return null
  }
  const clean = tickets.filter(
    (ticket): ticket is string => typeof ticket === 'string' && isTicketKey(ticket),
  )
  if (clean.length === 0) {
    return null
  }
  return { date, tickets: clean, minutes: parseMinutes(raw['minutes'], clean.length) }
}

function parseQueue(raw: unknown): readonly QueueEntry[] | null {
  if (!isRecord(raw)) {
    return null
  }
  const entries = raw['entries']
  if (!Array.isArray(entries)) {
    return []
  }
  return entries.flatMap((entry: unknown) => {
    const parsed = parseEntry(entry)
    return parsed === null ? [] : [parsed]
  })
}

export function loadQueue(dataDir: string): readonly QueueEntry[] {
  return readJson(join(dataDir, QUEUE_FILE), parseQueue, [])
}

// "minutes" is left out for an even split, as the WPF app writes it.
export async function saveQueue(dataDir: string, queue: readonly QueueEntry[]): Promise<void> {
  const entries = queue.map(({ date, tickets, minutes }) =>
    minutes === null ? { date, tickets } : { date, tickets, minutes },
  )
  await writeJsonAtomic(join(dataDir, QUEUE_FILE), { entries })
}
