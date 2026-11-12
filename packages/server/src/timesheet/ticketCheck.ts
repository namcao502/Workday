import { typoNeighbors, type Ticket, type TicketCheck, type TicketTracker } from '@workday/core'

export interface BoardKeys {
  knownKeys(): ReadonlySet<string>
  summaryOf(key: string): string | null
}

// Whether a key is the user's, per tracker for the session; the owner drops it when the tracker changes.
export class MineCache {
  private readonly isMineByKey = new Map<string, boolean>()

  constructor(private readonly tracker: TicketTracker) {}

  is(tracker: TicketTracker): boolean {
    return this.tracker === tracker
  }

  // Throws when Jira fails; only the keys not asked before go to Jira.
  async filterMine(keys: readonly string[]): Promise<ReadonlySet<string>> {
    const uncached = [...new Set(keys)].filter((key) => !this.isMineByKey.has(key))
    if (uncached.length !== 0) {
      const mine = await this.tracker.filterMine(uncached)
      for (const key of uncached) {
        this.isMineByKey.set(key, mine.has(key))
      }
    }
    return new Set(keys.filter((key) => this.isMineByKey.get(key) === true))
  }
}

// undefined = Jira could not be asked.
export async function lookUp(
  tracker: TicketTracker,
  key: string,
): Promise<Ticket | null | undefined> {
  try {
    return await tracker.getTicket(key)
  } catch {
    return undefined
  }
}

function suggestionFor(key: string, board: BoardKeys): string | null {
  return typoNeighbors(key, board.knownKeys())[0] ?? null
}

// A board key is the user's; any other key is looked up, then asked whether it is the user's.
export async function checkTickets(
  keys: readonly string[],
  board: BoardKeys,
  tracker: TicketTracker | null,
  mineCache: MineCache | null,
): Promise<readonly TicketCheck[]> {
  const known = board.knownKeys()
  const looked = await Promise.all(
    keys.map(async (key): Promise<TicketCheck> => {
      if (known.has(key)) {
        const summary = board.summaryOf(key)
        return { key, status: 'valid', summary, isMine: true, suggestedKey: null }
      }
      const ticket = tracker === null ? undefined : await lookUp(tracker, key)
      if (ticket === undefined) {
        return { key, status: 'unknown', summary: null, isMine: null, suggestedKey: null }
      }
      if (ticket === null) {
        const suggestedKey = suggestionFor(key, board)
        return { key, status: 'notFound', summary: null, isMine: null, suggestedKey }
      }
      return { key, status: 'valid', summary: ticket.summary, isMine: null, suggestedKey: null }
    }),
  )
  const toAsk = looked.filter((check) => check.status === 'valid' && check.isMine === null)
  if (toAsk.length === 0 || mineCache === null) {
    return looked
  }
  let mine: ReadonlySet<string>
  try {
    mine = await mineCache.filterMine(toAsk.map((check) => check.key))
  } catch {
    return looked
  }
  return looked.map((check) => {
    if (check.status !== 'valid' || check.isMine !== null) {
      return check
    }
    const isMine = mine.has(check.key)
    return { ...check, isMine, suggestedKey: isMine ? null : suggestionFor(check.key, board) }
  })
}
