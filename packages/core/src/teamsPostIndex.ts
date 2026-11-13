// Each channel's ticket posts and how far its pages were read; persistence is the server's.
import type { TeamsMessage } from './teamsChat.js'

export interface TeamsIndexedPost {
  readonly rootId: string
  readonly sentAt: string
  readonly mine: boolean
}

export interface TeamsChannelIndex {
  readonly syncedAt: string | null
  readonly deepScanned: boolean
  readonly deepScanPages: number
  readonly deepScanLink: string | null
  readonly posts: Readonly<Record<string, TeamsIndexedPost>>
}

/** Channel id -> its index. */
export type TeamsPostIndex = Readonly<Record<string, TeamsChannelIndex>>

const POST_LIFETIME_MS = 200 * 24 * 60 * 60 * 1000
const TICKET_SUBJECT_KEY = /^\s*([A-Za-z][A-Za-z0-9]+-[0-9]+)/

export function emptyChannelIndex(): TeamsChannelIndex {
  return { syncedAt: null, deepScanned: false, deepScanPages: 0, deepScanLink: null, posts: {} }
}

function winsOver(post: TeamsIndexedPost, indexed: TeamsIndexedPost): boolean {
  if (post.mine !== indexed.mine) {
    return post.mine
  }
  return Date.parse(post.sentAt) > Date.parse(indexed.sentAt)
}

/** A subject starting with a ticket key is that ticket's post; an own post beats another's, then the newer wins. Posts older than 200 days are dropped. The same index comes back when nothing changed. */
export function withPosts(
  index: TeamsChannelIndex,
  messages: readonly TeamsMessage[],
  myId: string,
  now: string,
): TeamsChannelIndex {
  const posts: Record<string, TeamsIndexedPost> = { ...index.posts }
  let changed = false
  for (const message of messages) {
    const match = message.subject === null ? null : TICKET_SUBJECT_KEY.exec(message.subject)
    const ticketKey = match?.[1]?.toUpperCase()
    if (ticketKey === undefined) {
      continue
    }
    const post = { rootId: message.id, sentAt: message.sentAt, mine: message.senderId === myId }
    const indexed = Object.hasOwn(posts, ticketKey) ? posts[ticketKey] : undefined
    if (indexed === undefined || winsOver(post, indexed)) {
      posts[ticketKey] = post
      changed = true
    }
  }
  const oldest = Date.parse(now) - POST_LIFETIME_MS
  const kept = Object.entries(posts).filter(([, post]) => Date.parse(post.sentAt) >= oldest)
  if (!changed && kept.length === Object.keys(posts).length) {
    return index
  }
  return { ...index, posts: Object.fromEntries(kept) }
}

export function withoutPost(index: TeamsChannelIndex, ticketKey: string): TeamsChannelIndex {
  const postKey = ticketKey.toUpperCase()
  const kept = Object.entries(index.posts).filter(([key]) => key !== postKey)
  return { ...index, posts: Object.fromEntries(kept) }
}
