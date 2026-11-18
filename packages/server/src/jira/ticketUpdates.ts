import { join } from 'node:path'
import {
  applyRead,
  changedFields,
  keepOnly,
  markViewed,
  type BoardState,
  type ChangeHistory,
  type TicketContent,
  type TicketFieldIds,
  type TicketTracker,
  type TicketUpdate,
} from '@workday/core'
import type { EventSink } from '../events.js'
import { isRecord, readJson, writeJsonAtomic } from '../jsonFile.js'
import type { NoticeInput } from '../notices/noticeService.js'

const UPDATES_FILE = 'ticket-updates.json'

type UpdateMap = Readonly<Record<string, TicketUpdate>>

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

export function isTicketContent(raw: unknown): raw is TicketContent {
  return (
    isRecord(raw) &&
    typeof raw['summary'] === 'string' &&
    typeof raw['description'] === 'string' &&
    typeof raw['attachments'] === 'string' &&
    isNullableText(raw['dueDate']) &&
    isNullableText(raw['eta']) &&
    (raw['devPriority'] === null || typeof raw['devPriority'] === 'number')
  )
}

function isTicketUpdate(raw: unknown): raw is TicketUpdate {
  return (
    isRecord(raw) &&
    isTicketContent(raw['viewed']) &&
    isTicketContent(raw['current']) &&
    typeof raw['updated'] === 'string' &&
    isNullableText(raw['changedBy']) &&
    isNullableText(raw['changedAt'])
  )
}

export function parseTicketUpdates(raw: unknown): UpdateMap | null {
  if (!isRecord(raw)) {
    return null
  }
  const updates: Record<string, TicketUpdate> = {}
  for (const [key, entry] of Object.entries(raw)) {
    if (!isTicketUpdate(entry)) {
      return null
    }
    updates[key] = entry
  }
  return updates
}

export function loadTicketUpdates(dataDir: string): UpdateMap {
  return readJson(join(dataDir, UPDATES_FILE), parseTicketUpdates, {})
}

export async function saveTicketUpdates(dataDir: string, updates: UpdateMap): Promise<void> {
  await writeJsonAtomic(join(dataDir, UPDATES_FILE), updates)
}

export interface TicketUpdateDeps {
  readonly initial: UpdateMap
  readonly save: (updates: UpdateMap) => Promise<void>
  readonly events: EventSink
  readonly notices: {
    add(input: NoticeInput): Promise<unknown>
    markReadAt(place: string): Promise<void>
  }
  readonly board: { snapshot(): BoardState }
  readonly logError: (message: string, error: unknown) => void
}

// One ticket read from Jira, waiting to be applied to the store.
interface TicketRead {
  readonly key: string
  readonly updated: string
  readonly content: TicketContent
  readonly histories: readonly ChangeHistory[] | null
  readonly myAccountId: string | null
}

// Port of JiraTicketUpdateChecker: what changed on a watched ticket since the user last viewed it.
export class TicketUpdateService {
  private updates: UpdateMap
  private queue: Promise<void> = Promise.resolve()
  private checking: Promise<void> = Promise.resolve()
  private account: { readonly tracker: TicketTracker; readonly id: string } | null = null

  constructor(private readonly deps: TicketUpdateDeps) {
    this.updates = deps.initial
  }

  view(): UpdateMap {
    return this.updates
  }

  // Never throws on a failed Jira read; a failed save rejects, the caller logs it. Checks run one after another.
  check(tracker: TicketTracker, fieldIds: TicketFieldIds): Promise<void> {
    const run = this.checking.then(() => this.runCheck(tracker, fieldIds))
    this.checking = run.catch(() => undefined)
    return run
  }

  // Marks what the user was shown as viewed and reads the notice; a ticket with no entry changes nothing.
  async markViewed(key: string, shown: TicketContent): Promise<void> {
    await this.enqueue(async () => {
      const entry = this.updates[key]
      if (entry !== undefined) {
        await this.commit({ ...this.updates, [key]: markViewed(entry, shown) })
      }
    })
    await this.deps.notices.markReadAt(placeOf(key))
  }

  private async runCheck(tracker: TicketTracker, fieldIds: TicketFieldIds): Promise<void> {
    const reads: TicketRead[] = []
    const { new: pending, inProgress } = this.deps.board.snapshot()
    for (const ticket of [...Object.values(pending), ...Object.values(inProgress)]) {
      const stored = this.updates[ticket.key]
      if (ticket.updated === null || stored?.updated === ticket.updated) {
        continue
      }
      try {
        const read = await this.read(tracker, ticket.key, ticket.updated, stored ?? null)
        if (read !== null) {
          reads.push(read)
        }
      } catch (error: unknown) {
        this.deps.logError(`Reading ${ticket.key} for updates failed; skipped`, error)
      }
    }
    const raised = await this.enqueue(() => this.apply(reads, fieldIds))
    for (const input of raised) {
      await this.deps.notices.add(input)
    }
  }

  // The changelog (after the content) only when a field moved since the stored read.
  private async read(
    tracker: TicketTracker,
    key: string,
    updated: string,
    stored: TicketUpdate | null,
  ): Promise<TicketRead | null> {
    const content = await tracker.getTicketContent(key)
    if (content === null) {
      return null
    }
    if (stored === null || changedFields(stored.current, content).length === 0) {
      return { key, updated, content, histories: null, myAccountId: null }
    }
    const histories = await tracker.getChangeHistories(key)
    return { key, updated, content, histories, myAccountId: await this.accountOf(tracker) }
  }

  private async accountOf(tracker: TicketTracker): Promise<string> {
    if (this.account !== null && this.account.tracker === tracker) {
      return this.account.id
    }
    const id = await tracker.myAccountId()
    this.account = { tracker, id }
    return id
  }

  // Applies on the store as it is now: the user may have viewed a ticket while Jira was read.
  private async apply(
    reads: readonly TicketRead[],
    fieldIds: TicketFieldIds,
  ): Promise<readonly NoticeInput[]> {
    const next: Record<string, TicketUpdate> = { ...this.updates }
    const raised: NoticeInput[] = []
    for (const read of reads) {
      const { update, isNewChange } = applyRead(
        next[read.key] ?? null,
        read.content,
        read.updated,
        read.histories,
        read.myAccountId,
        fieldIds,
      )
      next[read.key] = update
      if (isNewChange) {
        raised.push(noticeOf(read.key, update))
      }
    }
    const board = this.deps.board.snapshot()
    const boardKeys = new Set([
      ...Object.keys(board.new),
      ...Object.keys(board.inProgress),
      ...Object.keys(board.done),
    ])
    await this.commit(keepOnly(next, boardKeys))
    return raised
  }

  // Saved before it is kept, so a failed save leaves the store as it was; nothing changed writes nothing.
  private async commit(next: UpdateMap): Promise<void> {
    if (JSON.stringify(next) === JSON.stringify(this.updates)) {
      return
    }
    await this.deps.save(next)
    this.updates = next
    this.deps.events.broadcast({ type: 'work.changed' })
  }

  private enqueue<Result>(task: () => Promise<Result>): Promise<Result> {
    const run = this.queue.then(task)
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}

function placeOf(key: string): string {
  return `ticket-update:${key}`
}

function noticeOf(key: string, update: TicketUpdate): NoticeInput {
  return {
    topic: 'jira',
    tone: 'info',
    event: {
      type: 'ticketUpdated',
      key,
      fields: changedFields(update.viewed, update.current),
      changedBy: update.changedBy,
    },
    target: { kind: 'ticketUpdate', key },
    place: placeOf(key),
  }
}
