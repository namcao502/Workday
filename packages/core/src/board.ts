import { isSentBack, type StatusFlow } from './statusFlow.js'
import { isStatusDone, ticketEquals, type Ticket } from './ticket.js'

export type BoardSection = 'new' | 'inProgress' | 'done'
export interface DismissedTicket {
  readonly ticket: Ticket
  readonly origin: BoardSection
}
export interface BoardState {
  readonly new: Readonly<Record<string, Ticket>>
  readonly inProgress: Readonly<Record<string, Ticket>>
  readonly done: Readonly<Record<string, Ticket>>
  readonly dismissed: Readonly<Record<string, DismissedTicket>>
  readonly seenKeys: readonly string[] | null // null = never polled (first run takes a baseline)
}

type TicketMap = Readonly<Record<string, Ticket>>

const SECTIONS: readonly BoardSection[] = ['new', 'inProgress', 'done']

function without<Value>(
  record: Readonly<Record<string, Value>>,
  key: string,
): Record<string, Value> {
  return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key))
}

function isOnBoard(state: BoardState, key: string): boolean {
  return (
    Object.hasOwn(state.new, key) ||
    Object.hasOwn(state.inProgress, key) ||
    Object.hasOwn(state.done, key) ||
    Object.hasOwn(state.dismissed, key)
  )
}

// Same map object when no stored ticket differs from its live copy.
function refreshTickets(stored: TicketMap, live: TicketMap): TicketMap {
  let refreshed: Record<string, Ticket> | null = null
  for (const [key, storedTicket] of Object.entries(stored)) {
    const liveTicket = live[key]
    if (liveTicket !== undefined && !ticketEquals(liveTicket, storedTicket)) {
      refreshed ??= { ...stored }
      refreshed[key] = liveTicket
    }
  }
  return refreshed ?? stored
}

function refreshDismissed(
  stored: Readonly<Record<string, DismissedTicket>>,
  live: TicketMap,
): Readonly<Record<string, DismissedTicket>> {
  let refreshed: Record<string, DismissedTicket> | null = null
  for (const [key, entry] of Object.entries(stored)) {
    const liveTicket = live[key]
    if (liveTicket !== undefined && !ticketEquals(liveTicket, entry.ticket)) {
      refreshed ??= { ...stored }
      refreshed[key] = { ticket: liveTicket, origin: entry.origin }
    }
  }
  return refreshed ?? stored
}

function refreshAll(state: BoardState, live: TicketMap): BoardState {
  const next = {
    ...state,
    new: refreshTickets(state.new, live),
    inProgress: refreshTickets(state.inProgress, live),
    done: refreshTickets(state.done, live),
    dismissed: refreshDismissed(state.dismissed, live),
  }
  return isSameLists(state, next) ? state : next
}

function isSameLists(left: BoardState, right: BoardState): boolean {
  return (
    left.new === right.new &&
    left.inProgress === right.inProgress &&
    left.done === right.done &&
    left.dismissed === right.dismissed &&
    left.seenKeys === right.seenKeys
  )
}

// Tickets of the Done list that Jira sent back, with their live copies.
function sentBackTickets(state: BoardState, assigned: TicketMap, flow: StatusFlow): Ticket[] {
  const sentBack: Ticket[] = []
  for (const [key, storedTicket] of Object.entries(state.done)) {
    const liveTicket = assigned[key]
    if (liveTicket !== undefined && isSentBack(storedTicket.status, liveTicket.status, flow)) {
      sentBack.push(liveTicket)
    }
  }
  return sentBack
}

// Port of TicketPoller.PollAsync and TicketBoard: reopen first, since the detail refresh would overwrite the status it compares.
export function applyAssignedPoll(
  state: BoardState,
  assigned: TicketMap,
  flow: StatusFlow,
): BoardState {
  const sentBack = sentBackTickets(state, assigned, flow)
  let current = state
  if (sentBack.length !== 0) {
    let done = state.done
    let inProgress = state.inProgress
    for (const liveTicket of sentBack) {
      done = without(done, liveTicket.key)
      inProgress = { ...inProgress, [liveTicket.key]: liveTicket }
    }
    current = { ...state, done, inProgress }
  }

  current = refreshAll(current, assigned)

  const assignedKeys = Object.keys(assigned)
  if (current.seenKeys === null) {
    return { ...current, seenKeys: assignedKeys }
  }
  const seenKeys = new Set(current.seenKeys)
  const keysNewToSeen = assignedKeys.filter((key) => !seenKeys.has(key))
  if (keysNewToSeen.length === 0) {
    return current
  }
  const addedToNew: Record<string, Ticket> = {}
  for (const key of keysNewToSeen) {
    const liveTicket = assigned[key]
    if (liveTicket !== undefined && !isOnBoard(current, key)) {
      addedToNew[key] = liveTicket
    }
  }
  return {
    ...current,
    new: { ...current.new, ...addedToNew },
    seenKeys: [...current.seenKeys, ...keysNewToSeen],
  }
}

// Keys to fetch one by one: on the board, not Done in Jira, and gone from the assigned query.
export function offPollKeys(state: BoardState, assigned: TicketMap): readonly string[] {
  const candidates = [...Object.values(state.new), ...Object.values(state.inProgress)]
  const keys = candidates
    .filter((ticket) => !isStatusDone(ticket) && !Object.hasOwn(assigned, ticket.key))
    .map((ticket) => ticket.key)
  return [...new Set(keys)]
}

// Runs on the current state: a ticket moved while the live fetches were awaited is judged where it sits now.
export function applyLiveTickets(state: BoardState, live: TicketMap): BoardState {
  let current = state
  for (const section of ['new', 'inProgress'] as const) {
    for (const [key, storedTicket] of Object.entries(state[section])) {
      const liveTicket = live[key]
      if (liveTicket !== undefined && isStatusDone(liveTicket) && !isStatusDone(storedTicket)) {
        current = {
          ...current,
          [section]: without(current[section], key),
          done: { ...current.done, [key]: liveTicket },
        }
      }
    }
  }
  return refreshAll(current, live)
}

// Null when the ticket is already on the board (any list, dismissed included).
export function addTicket(state: BoardState, ticket: Ticket): BoardState | null {
  if (isOnBoard(state, ticket.key)) {
    return null
  }
  // seenKeys stays null without a baseline: writing it would fake one and the next poll would skip its notice step.
  const seenKeys = state.seenKeys === null ? null : [...state.seenKeys, ticket.key]
  return { ...state, new: { ...state.new, [ticket.key]: ticket }, seenKeys }
}

export function markDone(state: BoardState, key: string): BoardState {
  const ticket = state.new[key] ?? state.inProgress[key]
  if (ticket === undefined) {
    return state
  }
  return {
    ...state,
    new: without(state.new, key),
    inProgress: without(state.inProgress, key),
    done: { ...state.done, [key]: ticket },
  }
}

// Start moves only a new ticket; one already in progress, done or dismissed stays where it is.
export function startTicket(state: BoardState, key: string): BoardState {
  const ticket = state.new[key]
  if (ticket === undefined) {
    return state
  }
  return {
    ...state,
    new: without(state.new, key),
    inProgress: { ...state.inProgress, [key]: ticket },
  }
}

export function reopen(state: BoardState, key: string): BoardState {
  const ticket = state.done[key]
  if (ticket === undefined) {
    return state
  }
  return {
    ...state,
    done: without(state.done, key),
    inProgress: { ...state.inProgress, [key]: ticket },
  }
}

// Kept in dismissed with its origin so restore puts it back; seenKeys is untouched so a poll never re-adds it.
export function dismiss(state: BoardState, key: string): BoardState {
  for (const section of SECTIONS) {
    const ticket = state[section][key]
    if (ticket !== undefined) {
      return {
        ...state,
        [section]: without(state[section], key),
        dismissed: { ...state.dismissed, [key]: { ticket, origin: section } },
      }
    }
  }
  return state
}

export function restore(state: BoardState, key: string): BoardState {
  const entry = state.dismissed[key]
  if (entry === undefined) {
    return state
  }
  return {
    ...state,
    dismissed: without(state.dismissed, key),
    [entry.origin]: { ...state[entry.origin], [key]: entry.ticket },
  }
}
