// Port of TrayApp.TeamsAttention and ReadConversationsAsync: reminds of Teams messages waiting for an answer.
import {
  conversationKey,
  pendingMessage,
  prunedMarks,
  sameMarks,
  shouldNotify,
  TeamsSignedOut,
  type BoardState,
  type Ticket,
  type TeamsAttentionItem,
  type TeamsThread,
  type WorkspaceTab,
} from '@workday/core'
import type { Scheduler } from '../settings/settingsService.js'
import type { EventSink } from '../events.js'
import type { NoticeInput } from '../notices/noticeService.js'
import type { TeamsLookup } from './teamsLookup.js'
import type { TeamsState } from './teamsStore.js'

export const TEAMS_CHECK_MINUTES = 2
const STARTED_TICKET_LIMIT = 10

export interface TeamsWatcherDeps {
  readonly lookup: TeamsLookup
  readonly board: { snapshot(): BoardState }
  readonly workspace: { view(): { readonly tabs: readonly WorkspaceTab[] } }
  readonly notices: {
    add(input: NoticeInput): Promise<unknown>
    markReadAt(place: string): Promise<void>
  }
  readonly events: EventSink
  readonly scheduler: Scheduler
  readonly logError: (message: string, error: unknown) => void
}

interface Conversation {
  readonly ticketKey: string
  readonly chatId: string | null
  readonly title: string
  readonly thread: TeamsThread
}

function threadKey(ticketKey: string, thread: TeamsThread): string {
  return conversationKey(ticketKey, thread.conversationId, thread.isChat ? null : thread.rootId)
}

function newestAt(thread: TeamsThread): string | null {
  return thread.messages.reduce<string | null>(
    (best, message) =>
      best === null || Date.parse(message.sentAt) > Date.parse(best) ? message.sentAt : best,
    null,
  )
}

function laterOf(mark: string | undefined, sentAt: string): string {
  return mark !== undefined && Date.parse(mark) > Date.parse(sentAt) ? mark : sentAt
}

// Earliest due first, undated last, then by key.
function byDue(a: Ticket, b: Ticket): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) {
      return 1
    }
    if (b.dueDate === null) {
      return -1
    }
    return a.dueDate < b.dueDate ? -1 : 1
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

export class TeamsWatcher {
  private pending: readonly TeamsAttentionItem[] = []
  // Conversations the last check read, plus ones marked seen since; their marks are never pruned.
  private readKeys: ReadonlySet<string> = new Set()
  private running = false

  constructor(private readonly deps: TeamsWatcherDeps) {}

  items(): readonly TeamsAttentionItem[] {
    return this.pending
  }

  // Conversation ids of the ticket that have a message waiting.
  pendingIds(ticketKey: string): readonly string[] {
    return this.pending
      .filter((item) => item.ticketKey === ticketKey)
      .map((item) => item.conversationId)
  }

  // Teams on or off, or the client or watch list changed: a changed one restarts the schedule.
  configure(active: boolean, changed: boolean): void {
    if (!active) {
      this.deps.scheduler.stop()
      this.pending = []
    } else if (changed) {
      this.deps.scheduler.start(TEAMS_CHECK_MINUTES)
    }
  }

  // After a sign-in the check that paused on a signed-out session starts again.
  resume(): void {
    if (this.deps.lookup.chat !== null) {
      this.deps.scheduler.start(TEAMS_CHECK_MINUTES)
    }
  }

  async check(): Promise<void> {
    const chat = this.deps.lookup.chat
    if (chat === null || this.running) {
      return
    }
    this.running = true
    try {
      const ticketKeys = this.ticketKeys()
      if (ticketKeys.length !== 0) {
        const myId = await chat.myId()
        const conversations = await this.read(ticketKeys)
        await this.apply(conversations, myId)
      }
    } catch (error: unknown) {
      if (error instanceof TeamsSignedOut) {
        this.deps.scheduler.stop()
        this.deps.lookup.log(
          '[teams] attention: signed out, the check pauses until the next sign-in',
        )
      } else {
        this.deps.logError('The Teams check failed', error)
      }
    } finally {
      this.running = false
    }
  }

  // The user read the conversation: its mark moves to the newest message and the to-do and notice go.
  async seen(ticketKey: string, conversationId: string): Promise<void> {
    const found = this.pending.find(
      (item) => item.ticketKey === ticketKey && item.conversationId === conversationId,
    )
    const target =
      found === undefined
        ? await this.liveMark(ticketKey, conversationId)
        : { key: found.conversationKey, at: found.sentAt }
    if (target === null) {
      return
    }
    const { key, at: sentAt } = target
    this.readKeys = new Set([...this.readKeys, key])
    await this.deps.lookup.changeState((state) =>
      this.withMarks(state, (seenAt, notifiedAt) => {
        seenAt[key] = laterOf(seenAt[key], sentAt)
        notifiedAt[key] = laterOf(notifiedAt[key], sentAt)
      }),
    )
    this.setPending(this.pending.filter((item) => item.conversationKey !== key))
    await this.deps.notices.markReadAt(`teams:${key}`)
  }

  // A conversation not in the pending list is read now, so a message that came since the check is not reminded.
  private async liveMark(
    ticketKey: string,
    conversationId: string,
  ): Promise<{ readonly key: string; readonly at: string } | null> {
    const chat = this.deps.lookup.chat
    if (chat === null) {
      return null
    }
    try {
      const thread = await this.deps.lookup.resolveThread(chat, ticketKey, conversationId)
      const at = thread === null ? null : newestAt(thread)
      return thread === null || at === null ? null : { key: threadKey(ticketKey, thread), at }
    } catch (error: unknown) {
      this.deps.logError('Reading a Teams conversation to mark it seen failed', error)
      return null
    }
  }

  // The 10 nearest-due started tickets, plus the tickets with an open Workspace tab.
  private ticketKeys(): readonly string[] {
    const started = Object.values(this.deps.board.snapshot().inProgress)
      .sort(byDue)
      .slice(0, STARTED_TICKET_LIMIT)
      .map((ticket) => ticket.key)
    const open = this.deps.workspace
      .view()
      .tabs.filter((tab) => tab.kind === 'ticket')
      .map((tab) => tab.id)
    return [...new Set([...started, ...open])]
  }

  // Each ticket's indexed post in every watched channel and its chats; no sync, no search.
  private async read(ticketKeys: readonly string[]): Promise<readonly Conversation[]> {
    const { lookup } = this.deps
    const chat = lookup.chat
    if (chat === null) {
      return []
    }
    const channels = await lookup.channels(chat)
    const conversations: Conversation[] = []
    let failed = 0
    for (const ticketKey of ticketKeys) {
      for (const channel of channels) {
        const post = lookup.posts.get(channel.id).posts[ticketKey.toUpperCase()]
        if (post === undefined) {
          continue
        }
        try {
          const thread = await lookup.postThread(chat, channel.id, post.rootId)
          if (thread !== null) {
            const title = `${channel.teamName} > ${channel.channelName}`
            conversations.push({ ticketKey, chatId: null, title, thread })
          }
        } catch (error: unknown) {
          failed += this.skipOrThrow(error)
        }
      }
      for (const ticketChat of await lookup.ticketChats(chat, ticketKey)) {
        try {
          const thread = await chat.chat(ticketChat.id)
          conversations.push({ ticketKey, chatId: ticketChat.id, title: ticketChat.topic, thread })
        } catch (error: unknown) {
          failed += this.skipOrThrow(error)
        }
      }
    }
    if (failed !== 0) {
      lookup.log(`[teams] attention: ${String(failed)} conversation(s) could not be read`)
    }
    return conversations
  }

  private skipOrThrow(error: unknown): number {
    if (error instanceof TeamsSignedOut) {
      throw error
    }
    return 1
  }

  // Marks, the pending list and the notices change together; notices only once the marks are saved.
  private async apply(conversations: readonly Conversation[], myId: string): Promise<void> {
    const items: TeamsAttentionItem[] = []
    const raised: TeamsAttentionItem[] = []
    this.readKeys = new Set(conversations.map((c) => threadKey(c.ticketKey, c.thread)))
    await this.deps.lookup.changeState((state) => {
      items.length = 0
      raised.length = 0
      const next = this.withMarks(state, (seenAt, notifiedAt) => {
        for (const { ticketKey, chatId, title, thread } of conversations) {
          const newest = newestAt(thread)
          if (newest === null) {
            continue
          }
          const key = threadKey(ticketKey, thread)
          const item = pendingMessage(thread, ticketKey, title, chatId, myId, seenAt[key] ?? null)
          if (item !== null) {
            items.push(item)
            if (shouldNotify(item, notifiedAt[key] ?? null, state.baselineDone, chatId === null)) {
              raised.push(item)
            }
          }
          notifiedAt[key] = newest
        }
      })
      return next.baselineDone ? next : { ...next, baselineDone: true }
    })
    this.setPending(items)
    for (const item of raised) {
      await this.deps.notices.add(noticeOf(item)).catch((error: unknown) => {
        this.deps.logError('Adding a Teams notice failed', error)
      })
    }
  }

  // A copy of the marks changed by `update`, pruned; the same state object when nothing changed.
  private withMarks(
    state: TeamsState,
    update: (seenAt: Record<string, string>, notifiedAt: Record<string, string>) => void,
  ): TeamsState {
    const seenAt = { ...state.seenAt }
    const notifiedAt = { ...state.notifiedAt }
    update(seenAt, notifiedAt)
    const now = this.deps.lookup.now().toISOString()
    const next = {
      ...state,
      seenAt: prunedMarks(seenAt, now, this.readKeys),
      notifiedAt: prunedMarks(notifiedAt, now, this.readKeys),
    }
    const same =
      sameMarks(state.seenAt, next.seenAt) && sameMarks(state.notifiedAt, next.notifiedAt)
    return same ? state : next
  }

  private setPending(items: readonly TeamsAttentionItem[]): void {
    const changed = JSON.stringify(items) !== JSON.stringify(this.pending)
    this.pending = items
    if (changed) {
      this.deps.events.broadcast({ type: 'work.changed' })
    }
  }
}

function noticeOf(item: TeamsAttentionItem): NoticeInput {
  return {
    topic: item.mentionsMe ? 'teamsMention' : 'teams',
    tone: 'info',
    event: {
      type: 'teamsMessage',
      key: item.ticketKey,
      title: item.title,
      sender: item.senderName,
      mention: item.mentionsMe,
    },
    target: { kind: 'teams', key: item.ticketKey, conversationId: item.conversationId },
    place: `teams:${item.conversationKey}`,
  }
}
