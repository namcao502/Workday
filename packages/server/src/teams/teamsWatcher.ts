// Port of TrayApp.TeamsAttention and ReadConversationsAsync: reminds of Teams messages waiting for an answer.
import {
  conversationKey,
  dbReviewDue,
  endsWithApproval,
  isDbReviewChannel,
  pendingApproval,
  pendingMessage,
  prunedMarks,
  sameMarks,
  shouldNotify,
  TeamsSignedOut,
  type BoardState,
  type BugFix,
  type BugReply,
  type DbReviewApproval,
  type DbReviewChannel,
  type Ticket,
  type TeamsAttentionItem,
  type TeamsThread,
  type WorkspaceTab,
} from '@workday/core'
import type { Scheduler } from '../settings/settingsService.js'
import type { EventSink } from '../events.js'
import type { RecordJob } from '../schedules/jobRuns.js'
import type { NoticeInput } from '../notices/noticeService.js'
import { BugFixReplies, type FixToAnnounce } from './bugFixReplies.js'
import type { TeamsLookup } from './teamsLookup.js'
import type { TeamsState } from './teamsStore.js'

export const TEAMS_CHECK_MINUTES = 2
const STARTED_TICKET_LIMIT = 10

// After a failed check the next ones wait longer (minutes), so a broken Teams session does not open the
// sign-in browser, and raise a Microsoft prompt, every two minutes.
const FAILURE_WAIT_MINUTES: readonly number[] = [2, 5, 15, 30]
const MILLISECONDS_PER_MINUTE = 60_000

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
  readonly dbReviewChannel: () => DbReviewChannel | null
  // The current fix drafts, read at the start of each check; without it no bug fix is watched.
  readonly readBugFixes?: () => Promise<readonly BugFix[]>
  readonly recordJob?: RecordJob
  readonly now?: () => number
  readonly logError: (message: string, error: unknown) => void
}

interface Conversation {
  readonly ticketKey: string
  readonly chatId: string | null
  readonly title: string
  readonly thread: TeamsThread
  readonly isDbReview: boolean
}

// What one check found, collected inside the state change and used after it is saved.
interface Found {
  readonly items: TeamsAttentionItem[]
  readonly raised: TeamsAttentionItem[]
  readonly approvals: DbReviewApproval[]
  readonly approvalNotices: DbReviewApproval[]
}

// The four mark maps one check updates; every one is pruned together.
interface Marks {
  readonly seenAt: Record<string, string>
  readonly notifiedAt: Record<string, string>
  readonly dbReviewNotifiedAt: Record<string, string>
  readonly dbReviewDoneAt: Record<string, string>
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
  private approvals: readonly DbReviewApproval[] = []
  // Conversations the last check read, plus ones marked seen since; their marks are never pruned.
  private readKeys: ReadonlySet<string> = new Set()
  private running = false
  private failures = 0 // consecutive failed checks
  private waitUntil = 0 // no check before this time (ms)
  private readonly bugReplies = new BugFixReplies()

  constructor(private readonly deps: TeamsWatcherDeps) {}

  items(): readonly TeamsAttentionItem[] {
    return this.pending
  }

  dbReviewApprovals(): readonly DbReviewApproval[] {
    return this.approvals
  }

  // The user ran the approved SQL: the to-do stays gone until a newer approval.
  async markDbReviewDone(conversationKey: string): Promise<void> {
    const approval = this.approvals.find((found) => found.conversationKey === conversationKey)
    if (approval === undefined) {
      return
    }
    this.readKeys = new Set([...this.readKeys, conversationKey])
    await this.deps.lookup.changeState((state) =>
      this.withMarks(state, (marks) => {
        marks.dbReviewDoneAt[conversationKey] = laterOf(
          marks.dbReviewDoneAt[conversationKey],
          approval.approvedAt,
        )
      }),
    )
    this.setPending(
      this.pending,
      this.approvals.filter((found) => found.conversationKey !== conversationKey),
    )
  }

  // QC bug fixes known and not replied yet.
  bugFixesToAnswer(): readonly BugFix[] {
    return this.bugReplies.toAnswer()
  }

  // The fixes of this parent still to answer in a thread being shown, each with its reply for QC.
  replyCardFor(parentKey: string, thread: TeamsThread, myId: string): readonly BugReply[] {
    const before = JSON.stringify(this.bugReplies.toAnswer())
    const cards = this.bugReplies.cardFor(parentKey, thread, myId, threadKey(parentKey, thread))
    this.broadcastIfFixesChanged(before)
    return cards
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
      this.approvals = []
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
    const now = this.deps.now ?? Date.now
    if (chat === null || this.running || now() < this.waitUntil) {
      return
    }
    this.running = true
    const startedAt = new Date()
    let ok = true
    const fixesBefore = JSON.stringify(this.bugReplies.toAnswer())
    try {
      if (this.deps.readBugFixes !== undefined) {
        this.bugReplies.setFixes(await this.deps.readBugFixes())
      }
      const ticketKeys = this.ticketKeys()
      if (ticketKeys.length !== 0) {
        const myId = await chat.myId()
        const conversations = await this.read(ticketKeys)
        await this.apply(conversations, myId)
      }
    } catch (error: unknown) {
      ok = false
      if (error instanceof TeamsSignedOut) {
        this.deps.scheduler.stop()
        this.deps.lookup.log(
          '[teams] attention: signed out, the check pauses until the next sign-in',
        )
      } else {
        this.deps.logError('The Teams check failed', error)
        const waitMinutes =
          FAILURE_WAIT_MINUTES[Math.min(this.failures, FAILURE_WAIT_MINUTES.length - 1)] ?? 0
        this.failures += 1
        this.waitUntil = now() + waitMinutes * MILLISECONDS_PER_MINUTE
      }
    } finally {
      if (ok) {
        this.failures = 0
        this.waitUntil = 0
      }
      this.running = false
      this.broadcastIfFixesChanged(fixesBefore)
      this.deps.recordJob?.('teamsCheck', {
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        ok,
        summary: null,
      })
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
      this.withMarks(state, ({ seenAt, notifiedAt }) => {
        seenAt[key] = laterOf(seenAt[key], sentAt)
        notifiedAt[key] = laterOf(notifiedAt[key], sentAt)
      }),
    )
    this.setPending(
      this.pending.filter((item) => item.conversationKey !== key),
      this.approvals,
    )
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

  // The 10 nearest-due started tickets, the tickets with an open Workspace tab and the parents of fixes waiting.
  private ticketKeys(): readonly string[] {
    const started = Object.values(this.deps.board.snapshot().inProgress)
      .sort(byDue)
      .slice(0, STARTED_TICKET_LIMIT)
      .map((ticket) => ticket.key)
    const open = this.deps.workspace
      .view()
      .tabs.filter((tab) => tab.kind === 'ticket')
      .map((tab) => tab.id)
    return [...new Set([...started, ...open, ...this.bugReplies.parents()])]
  }

  // Each ticket's indexed post in every watched channel and its chats; no sync, no search.
  private async read(ticketKeys: readonly string[]): Promise<readonly Conversation[]> {
    const { lookup } = this.deps
    const chat = lookup.chat
    if (chat === null) {
      return []
    }
    const channels = await lookup.channels(chat)
    const dbReviewChannel = this.deps.dbReviewChannel()
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
            conversations.push({
              ticketKey,
              chatId: null,
              title,
              thread,
              isDbReview: isDbReviewChannel(channel, dbReviewChannel),
            })
          }
        } catch (error: unknown) {
          failed += this.skipOrThrow(error)
        }
      }
      for (const ticketChat of await lookup.ticketChats(chat, ticketKey)) {
        try {
          const thread = await chat.chat(ticketChat.id)
          conversations.push({
            ticketKey,
            chatId: ticketChat.id,
            title: ticketChat.topic,
            thread,
            isDbReview: false,
          })
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

  // Marks, the pending lists and the notices change together; notices only once the marks are saved.
  private async apply(conversations: readonly Conversation[], myId: string): Promise<void> {
    const found: Found = { items: [], raised: [], approvals: [], approvalNotices: [] }
    this.readKeys = new Set(conversations.map((c) => threadKey(c.ticketKey, c.thread)))
    await this.deps.lookup.changeState((state) => {
      found.items.length = 0
      found.raised.length = 0
      found.approvals.length = 0
      found.approvalNotices.length = 0
      const next = this.withMarks(state, (marks) => {
        for (const conversation of conversations) {
          this.attend(conversation, marks, myId, state.baselineDone, found)
        }
      })
      return next.baselineDone ? next : { ...next, baselineDone: true }
    })
    this.setPending(found.items, found.approvals)
    for (const { ticketKey, thread } of conversations) {
      this.bugReplies.update(ticketKey, thread, myId, threadKey(ticketKey, thread))
    }
    const fixNotices = this.bugReplies.announce().map(fixNoticeOf)
    for (const input of [
      ...found.raised.map(noticeOf),
      ...fixNotices,
      ...found.approvalNotices.map(approvalNoticeOf),
    ]) {
      await this.deps.notices.add(input).catch((error: unknown) => {
        this.deps.logError('Adding a Teams notice failed', error)
      })
    }
  }

  // One conversation: its waiting message, and for a DB review post its approval; marks move to the newest.
  private attend(
    { ticketKey, chatId, title, thread, isDbReview }: Conversation,
    marks: Marks,
    myId: string,
    baselineDone: boolean,
    found: Found,
  ): void {
    const newest = newestAt(thread)
    if (newest === null) {
      return
    }
    const key = threadKey(ticketKey, thread)
    const approval = isDbReview ? pendingApproval(thread, ticketKey, key, myId) : null
    if (approval !== null) {
      const due = dbReviewDue(
        approval,
        marks.dbReviewNotifiedAt[key] ?? null,
        marks.dbReviewDoneAt[key] ?? null,
      )
      if (due.isTodo) {
        found.approvals.push(approval)
        marks.dbReviewNotifiedAt[key] = laterOf(marks.dbReviewNotifiedAt[key], approval.approvedAt)
      }
      if (due.isNotice) {
        found.approvalNotices.push(approval)
      }
    }
    // An approval of my own post is its own to-do (done or not), not a message waiting for an answer.
    const item = pendingMessage(thread, ticketKey, title, chatId, myId, marks.seenAt[key] ?? null)
    const isApprovalNewest = approval !== null && endsWithApproval(thread, myId)
    if (item !== null && !isApprovalNewest) {
      found.items.push(item)
      if (shouldNotify(item, marks.notifiedAt[key] ?? null, baselineDone, chatId === null)) {
        found.raised.push(item)
      }
    }
    marks.notifiedAt[key] = newest
  }

  // A copy of the marks changed by `update`, pruned; the same state object when nothing changed.
  private withMarks(state: TeamsState, update: (marks: Marks) => void): TeamsState {
    const marks: Marks = {
      seenAt: { ...state.seenAt },
      notifiedAt: { ...state.notifiedAt },
      dbReviewNotifiedAt: { ...state.dbReviewNotifiedAt },
      dbReviewDoneAt: { ...state.dbReviewDoneAt },
    }
    update(marks)
    const now = this.deps.lookup.now().toISOString()
    const next = {
      ...state,
      seenAt: prunedMarks(marks.seenAt, now, this.readKeys),
      notifiedAt: prunedMarks(marks.notifiedAt, now, this.readKeys),
      dbReviewNotifiedAt: prunedMarks(marks.dbReviewNotifiedAt, now, this.readKeys),
      dbReviewDoneAt: prunedMarks(marks.dbReviewDoneAt, now, this.readKeys),
    }
    const same =
      sameMarks(state.seenAt, next.seenAt) &&
      sameMarks(state.notifiedAt, next.notifiedAt) &&
      sameMarks(state.dbReviewNotifiedAt, next.dbReviewNotifiedAt) &&
      sameMarks(state.dbReviewDoneAt, next.dbReviewDoneAt)
    return same ? state : next
  }

  private broadcastIfFixesChanged(before: string): void {
    if (JSON.stringify(this.bugReplies.toAnswer()) !== before) {
      this.deps.events.broadcast({ type: 'work.changed' })
    }
  }

  private setPending(
    items: readonly TeamsAttentionItem[],
    approvals: readonly DbReviewApproval[],
  ): void {
    const changed =
      JSON.stringify(items) !== JSON.stringify(this.pending) ||
      JSON.stringify(approvals) !== JSON.stringify(this.approvals)
    this.pending = items
    this.approvals = approvals
    if (changed) {
      this.deps.events.broadcast({ type: 'work.changed' })
    }
  }
}

function approvalNoticeOf(approval: DbReviewApproval): NoticeInput {
  return {
    topic: 'teams',
    tone: 'info',
    event: { type: 'dbReviewApproved', key: approval.ticketKey, approver: approval.approverName },
    target: { kind: 'teams', key: approval.ticketKey, conversationId: approval.channelId },
    place: `teams:${approval.conversationKey}`,
  }
}

function fixNoticeOf({ fix, conversationId, conversationKey }: FixToAnnounce): NoticeInput {
  return {
    topic: 'teams',
    tone: 'info',
    event: { type: 'qcBugFixed', key: fix.bugKey, parentKey: fix.parentKey },
    target: { kind: 'teams', key: fix.parentKey, conversationId },
    place: `teams:${conversationKey}`,
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
