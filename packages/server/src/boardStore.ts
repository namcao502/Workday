import { join } from 'node:path'
import type { BoardSection, BoardState, DismissedTicket, Ticket } from '@workday/core'
import { isRecord, readJson, writeJsonAtomic } from './jsonFile.js'

const BOARD_FILE = 'board.json'

const EMPTY_BOARD: BoardState = {
  new: {},
  inProgress: {},
  done: {},
  dismissed: {},
  seenKeys: null,
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number'
}

function parseTicket(raw: unknown): Ticket | null {
  if (
    !isRecord(raw) ||
    typeof raw['key'] !== 'string' ||
    typeof raw['summary'] !== 'string' ||
    !isNullableText(raw['dueDate']) ||
    !isNullableText(raw['eta']) ||
    !isNullableNumber(raw['devPriority']) ||
    !isNullableText(raw['status']) ||
    !isNullableText(raw['statusCategory']) ||
    !isNullableText(raw['issueType']) ||
    !isNullableNumber(raw['timeSpentSeconds']) ||
    !isNullableText(raw['updated']) ||
    !isNullableText(raw['parentKey'])
  ) {
    return null
  }
  return {
    key: raw['key'],
    summary: raw['summary'],
    dueDate: raw['dueDate'],
    eta: raw['eta'],
    devPriority: raw['devPriority'],
    status: raw['status'],
    statusCategory: raw['statusCategory'],
    issueType: raw['issueType'],
    timeSpentSeconds: raw['timeSpentSeconds'],
    updated: raw['updated'],
    parentKey: raw['parentKey'],
  }
}

function isBoardSection(value: unknown): value is BoardSection {
  return value === 'new' || value === 'inProgress' || value === 'done'
}

function parseTicketMap(raw: unknown): Readonly<Record<string, Ticket>> | null {
  if (!isRecord(raw)) {
    return null
  }
  const tickets: Record<string, Ticket> = {}
  for (const [key, rawTicket] of Object.entries(raw)) {
    const ticket = parseTicket(rawTicket)
    if (ticket === null) {
      return null
    }
    tickets[key] = ticket
  }
  return tickets
}

function parseDismissedMap(raw: unknown): Readonly<Record<string, DismissedTicket>> | null {
  if (!isRecord(raw)) {
    return null
  }
  const dismissed: Record<string, DismissedTicket> = {}
  for (const [key, entry] of Object.entries(raw)) {
    if (!isRecord(entry) || !isBoardSection(entry['origin'])) {
      return null
    }
    const ticket = parseTicket(entry['ticket'])
    if (ticket === null) {
      return null
    }
    dismissed[key] = { ticket, origin: entry['origin'] }
  }
  return dismissed
}

function parseSeenKeys(raw: unknown): readonly string[] | null | undefined {
  if (raw === null) {
    return null
  }
  if (Array.isArray(raw) && raw.every((item): item is string => typeof item === 'string')) {
    return raw
  }
  return undefined
}

function parseBoard(raw: unknown): BoardState | null {
  if (!isRecord(raw)) {
    return null
  }
  const newTickets = parseTicketMap(raw['new'])
  const inProgress = parseTicketMap(raw['inProgress'])
  const done = parseTicketMap(raw['done'])
  const dismissed = parseDismissedMap(raw['dismissed'])
  const seenKeys = parseSeenKeys(raw['seenKeys'])
  if (
    newTickets === null ||
    inProgress === null ||
    done === null ||
    dismissed === null ||
    seenKeys === undefined
  ) {
    return null
  }
  return { new: newTickets, inProgress, done, dismissed, seenKeys }
}

export function loadBoard(dataDir: string): BoardState {
  return readJson(join(dataDir, BOARD_FILE), parseBoard, EMPTY_BOARD)
}

export async function saveBoard(dataDir: string, board: BoardState): Promise<void> {
  await writeJsonAtomic(join(dataDir, BOARD_FILE), board)
}
