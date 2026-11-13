// Teams types and the pure operations on a ticket's post and thread; parsing is in teamsParse.ts.
import { REACTION_KEY, withoutSymbols } from './teamsParse.js'

export interface TeamsChannel {
  readonly id: string
  readonly teamName: string
  readonly channelName: string
}

export interface TeamsReaction {
  readonly key: string
  readonly userMris: readonly string[]
}

export interface TeamsMessageFile {
  readonly fileName: string
  readonly url: string
}

export interface TeamsMessage {
  readonly id: string
  readonly senderId: string
  readonly senderName: string
  readonly sentAt: string
  readonly content: string
  readonly isPlainText: boolean
  readonly subject: string | null
  readonly editedAt: string | null
  readonly mentionMris: Readonly<Record<string, string>>
  readonly hasFiles: boolean
  readonly reactions: readonly TeamsReaction[]
  readonly rootMessageId: string | null
  readonly files: readonly TeamsMessageFile[]
}

export interface TeamsMessagePage {
  readonly messages: readonly TeamsMessage[]
  readonly backwardLink: string | null
}

export interface TeamsThread {
  readonly conversationId: string
  readonly rootId: string
  readonly messages: readonly TeamsMessage[]
  readonly isChat: boolean
}

export interface TeamsGroupChat {
  readonly id: string
  readonly topic: string
}

export interface WatchedChannel {
  readonly team: string
  readonly channel: string
}

const EMOJI_CDN_ORIGIN = 'https://statics.teams.cdn.office.net'
/** Teams' six quick reactions, offered on every message. */
export const QUICK_REACTION_KEYS: readonly string[] = [
  'like',
  'heart',
  'laugh',
  'surprised',
  'sad',
  'angry',
]

function sameName(name: string, watchedName: string): boolean {
  return withoutSymbols(name).toLowerCase() === withoutSymbols(watchedName).toLowerCase()
}

/** The channels matching the watch list, in the watch list's order; names compare without symbols or case. */
export function watched(
  channels: readonly TeamsChannel[],
  watchList: readonly WatchedChannel[],
): readonly TeamsChannel[] {
  const found: TeamsChannel[] = []
  for (const entry of watchList) {
    for (const channel of channels) {
      if (
        sameName(channel.teamName, entry.team) &&
        sameName(channel.channelName, entry.channel) &&
        !found.includes(channel)
      ) {
        found.push(channel)
      }
    }
  }
  return found
}

/** Config lines "Team > Channel"; a line without both parts is skipped. */
export function parseWatchList(lines: readonly string[]): readonly WatchedChannel[] {
  const list: WatchedChannel[] = []
  for (const line of lines) {
    const separator = line.indexOf('>')
    const team = separator === -1 ? '' : line.slice(0, separator).trim()
    const channel = separator === -1 ? '' : line.slice(separator + 1).trim()
    if (team !== '' && channel !== '') {
      list.push({ team, channel })
    }
  }
  return list
}

/** Group chats whose topic starts with the ticket key (not a longer key such as MDP-10 for MDP-1). */
export function findTicketChats(
  chats: readonly TeamsGroupChat[],
  ticketKey: string,
): readonly TeamsGroupChat[] {
  const found: TeamsGroupChat[] = []
  const key = ticketKey.toLowerCase()
  for (const chat of chats) {
    const topic = chat.topic.trimStart()
    const startsWithKey = topic.toLowerCase().startsWith(key)
    const nextIsDigit = topic.length > key.length && /[0-9]/.test(topic.charAt(key.length))
    if (startsWithKey && !nextIsDigit && !found.some((other) => other.id === chat.id)) {
      found.push(chat)
    }
  }
  return found
}

/** The key of the seen / notified marks: a chat by its id, a post by its channel and root message. */
export function conversationKey(
  ticketKey: string,
  conversationId: string,
  rootId: string | null,
): string {
  const place =
    rootId === null || rootId === '' ? conversationId : `${conversationId};messageid=${rootId}`
  return `${ticketKey}|${place}`
}

// Mentions may spell the mri in another case than the sniffed id.
export function mentionsMe(message: TeamsMessage, myId: string): boolean {
  return Object.values(message.mentionMris).some((mri) => mri.toLowerCase() === myId.toLowerCase())
}

/** A quick reaction, or one the message already carries; the key goes into the request body. */
export function canReact(message: TeamsMessage, key: string): boolean {
  if (!REACTION_KEY.test(key)) {
    return false
  }
  return (
    QUICK_REACTION_KEYS.includes(key) || message.reactions.some((reaction) => reaction.key === key)
  )
}

// Teams draws "like" as the "yes" emoticon (thumbs up); the CDN's "like" is a pointing face.
export function emojiUrl(key: string): string {
  const emoticon = key === 'like' ? 'yes' : key
  return `${EMOJI_CDN_ORIGIN}/evergreen-assets/personal-expressions/v2/assets/emoticons/${emoticon}/default/30_f.png`
}
