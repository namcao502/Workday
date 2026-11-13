// Pure rules for reminding the user of Teams messages that wait for an answer.
import { conversationKey, mentionsMe } from './teamsChat.js'
import type { TeamsMessage, TeamsThread } from './teamsChat.js'

export interface TeamsAttentionItem {
  readonly ticketKey: string
  readonly conversationKey: string
  readonly chatId: string | null
  readonly title: string
  readonly senderName: string
  readonly sentAt: string
  readonly mentionsMe: boolean
  readonly conversationId: string
}

const MARK_LIFETIME_MS = 60 * 24 * 60 * 60 * 1000

function time(value: string): number {
  return Date.parse(value)
}

/** The newest message after my last one that I have not seen; null when nothing waits for me. */
export function pendingMessage(
  thread: TeamsThread,
  ticketKey: string,
  title: string,
  chatId: string | null,
  myId: string,
  seenAt: string | null,
): TeamsAttentionItem | null {
  const lastMineIndex = thread.messages.findLastIndex(
    (message) => message.senderId.toLowerCase() === myId.toLowerCase(),
  )
  const pending = thread.messages
    .slice(lastMineIndex + 1)
    .filter((message) => seenAt === null || time(message.sentAt) > time(seenAt))
  const newest = pending.reduce<TeamsMessage | null>(
    (best, message) => (best === null || time(message.sentAt) > time(best.sentAt) ? message : best),
    null,
  )
  if (newest === null) {
    return null
  }
  return {
    ticketKey,
    conversationKey: conversationKey(
      ticketKey,
      thread.conversationId,
      thread.isChat ? null : thread.rootId,
    ),
    chatId,
    title,
    senderName: newest.senderName,
    sentAt: newest.sentAt,
    mentionsMe: pending.some((message) => mentionsMe(message, myId)),
    conversationId: chatId ?? thread.conversationId,
  }
}

/**
 * A conversation without a mark is new to the check: a chat is news once the first check ran,
 * a post never is (one in a newly watched channel has only old messages).
 */
export function shouldNotify(
  item: TeamsAttentionItem,
  notifiedAt: string | null,
  baselineDone: boolean,
  isPost: boolean,
): boolean {
  if (notifiedAt !== null) {
    return time(item.sentAt) > time(notifiedAt)
  }
  return baselineDone && !isPost
}

export function sameMarks(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): boolean {
  const keys = Object.keys(before)
  return (
    keys.length === Object.keys(after).length &&
    keys.every((key) => {
      const other = after[key]
      return other !== undefined && time(other) === time(before[key] ?? '')
    })
  )
}

/** Drops marks older than 60 days, except a conversation still read (dropping it would notify again). */
export function prunedMarks(
  marks: Readonly<Record<string, string>>,
  now: string,
  readKeys: ReadonlySet<string>,
): Record<string, string> {
  const pruned: Record<string, string> = {}
  for (const [key, mark] of Object.entries(marks)) {
    if (readKeys.has(key) || time(mark) >= time(now) - MARK_LIFETIME_MS) {
      pruned[key] = mark
    }
  }
  return pruned
}
