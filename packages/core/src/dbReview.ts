// Pure rules for the Database Review channel: a schema change, the lead's approval, then the SQL runs on dev.
import type { DbReviewApproval, DbReviewChannel } from './api.js'
import type { TeamsChannel, TeamsMessage, TeamsThread } from './teams/teamsChat.js'
import { htmlDecode, toPlainText } from './teams/teamsHtml.js'

// "approve", "appr", "approved", also after an "ok": only the reply's start counts.
const APPROVAL_PATTERN = /^\s*(ok(e|ay)?\b[\s,.!]*)?appr(ove[ds]?)?\b/i
const CODE_BLOCK_PATTERN = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi
const LINE_BREAK_PATTERN = /<br\s*\/?>/gi
const TAG_PATTERN = /<[^>]*>/g
const NBSP = '\u00a0'

function time(value: string): number {
  return Date.parse(value)
}

function isMine(message: TeamsMessage, myId: string): boolean {
  return message.senderId.toLowerCase() === myId.toLowerCase()
}

function trimNewlines(text: string): string {
  let start = 0
  let end = text.length
  while (start < end && (text[start] === '\n' || text[start] === '\r')) {
    start++
  }
  while (end > start && (text[end - 1] === '\n' || text[end - 1] === '\r')) {
    end--
  }
  return text.slice(start, end)
}

export function isApproval(message: TeamsMessage): boolean {
  return APPROVAL_PATTERN.test(toPlainText(message.content, message.isPlainText))
}

/** The text of the message's code blocks, one blank line apart; null when it has none. */
export function sqlOf(message: TeamsMessage): string | null {
  if (message.isPlainText) {
    return null
  }
  const blocks = [...message.content.matchAll(CODE_BLOCK_PATTERN)]
    .map((match) => {
      const text = (match[1] ?? '').replace(LINE_BREAK_PATTERN, '\n').replace(TAG_PATTERN, '')
      return trimNewlines(htmlDecode(text).replaceAll(NBSP, ' '))
    })
    .filter((text) => text.trim() !== '')
  return blocks.length === 0 ? null : blocks.join('\n\n')
}

function newest(messages: readonly TeamsMessage[]): TeamsMessage | null {
  return messages.reduce<TeamsMessage | null>(
    (best, message) => (best === null || time(message.sentAt) > time(best.sentAt) ? message : best),
    null,
  )
}

/** The first approval by someone else after my newest SQL; the root counts as SQL. Only my own post. */
export function pendingApproval(
  thread: TeamsThread,
  ticketKey: string,
  conversationKey: string,
  myId: string,
): DbReviewApproval | null {
  const root = thread.messages.find((message) => message.id === thread.rootId)
  if (root === undefined || !isMine(root, myId)) {
    return null
  }
  const sqlMessages = thread.messages.filter(
    (message) => message.id === root.id || (isMine(message, myId) && sqlOf(message) !== null),
  )
  const approvals = thread.messages.filter(
    (message) => !isMine(message, myId) && isApproval(message),
  )
  const newestSqlAt = Math.max(...sqlMessages.map((message) => time(message.sentAt)))
  // The first one, so a second "approved" of the same SQL does not bring back a done to-do.
  const approval = approvals
    .filter((message) => time(message.sentAt) > newestSqlAt)
    .sort((a, b) => time(a.sentAt) - time(b.sentAt))[0]
  if (approval === undefined) {
    return null
  }
  // A thread can carry a second change after a first approval: this one covers only the SQL since.
  const previousTimes = approvals
    .filter((message) => time(message.sentAt) < newestSqlAt)
    .map((message) => time(message.sentAt))
  const previousAt = previousTimes.length === 0 ? null : Math.max(...previousTimes)
  const sql = sqlMessages
    .filter((message) => previousAt === null || time(message.sentAt) > previousAt)
    .sort((a, b) => time(a.sentAt) - time(b.sentAt))
    .map((message) => sqlOf(message) ?? toPlainText(message.content, message.isPlainText))
  return {
    ticketKey,
    conversationKey,
    channelId: thread.conversationId,
    approverName: approval.senderName,
    approvedAt: approval.sentAt,
    sql: sql.join('\n\n'),
  }
}

/** An approval seen days late still counts: its SQL may not have been run. */
export function dbReviewDue(
  approval: DbReviewApproval,
  notifiedAt: string | null,
  doneAt: string | null,
): { isTodo: boolean; isNotice: boolean } {
  if (doneAt !== null && time(doneAt) >= time(approval.approvedAt)) {
    return { isTodo: false, isNotice: false }
  }
  return {
    isTodo: true,
    isNotice: notifiedAt === null || time(notifiedAt) < time(approval.approvedAt),
  }
}

/** The thread's newest message is an approval by someone else: the approval to-do replaces "X wrote". */
export function endsWithApproval(thread: TeamsThread, myId: string): boolean {
  const last = newest(thread.messages)
  return last !== null && !isMine(last, myId) && isApproval(last)
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function isDbReviewChannel(
  channel: TeamsChannel,
  configured: DbReviewChannel | null,
): boolean {
  return (
    configured !== null &&
    sameText(channel.teamName, configured.teamName) &&
    sameText(channel.channelName, configured.channelName)
  )
}
