// Reads the Teams chat service's JSON into the types of teamsChat.ts; a bad entry is skipped, never thrown.
import type {
  TeamsChannel,
  TeamsGroupChat,
  TeamsMessage,
  TeamsMessageFile,
  TeamsMessagePage,
  TeamsReaction,
} from './teamsChat.js'

type Json = Readonly<Record<string, unknown>>

const KNOWN_HTML_TAG =
  /<(p|div|span|br|a|img|pre|code|b|strong|i|em|u|s|ul|ol|li|blockquote|table|h[1-6])\b/i
// A reaction key goes into the emoji CDN's path, so only Teams' own key shape gets through.
export const REACTION_KEY = /^[A-Za-z0-9_-]{1,64}$/
const SYMBOL = /[\p{So}\p{Sk}]/u

function isJson(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(element: unknown, name: string): string | null {
  if (!isJson(element)) {
    return null
  }
  const value = element[name]
  return typeof value === 'string' ? value : null
}

function array(element: unknown, name: string): readonly unknown[] | null {
  if (!isJson(element)) {
    return null
  }
  const value = element[name]
  return Array.isArray(value) ? (value as readonly unknown[]) : null
}

// A property that is an array, or a JSON string holding one (Teams writes both).
function arrayOrJsonString(element: Json, name: string): readonly unknown[] | null {
  const value = element[name]
  if (Array.isArray(value)) {
    return value as readonly unknown[]
  }
  if (typeof value !== 'string' || value === '') {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as readonly unknown[]) : null
  } catch {
    return null
  }
}

function dropSymbols(name: string, isSymbolDropped: (char: string) => boolean): string {
  let kept = ''
  for (const char of name) {
    if (!isSymbolDropped(char) && char !== '\uFE0F' && char !== '\u200D') {
      kept += char
    }
  }
  return kept
}

/** Drops the newer emoji (they draw as a box on Windows 10), keeps a name that is only emoji. */
export function withoutEmoji(name: string): string {
  const kept = dropSymbols(
    name,
    (char) => (char.codePointAt(0) ?? 0) >= 0x1f000 && SYMBOL.test(char),
  )
  const plain = kept.replace(/ {2,}/g, ' ').trim()
  return plain === '' ? name : plain
}

// Unlike withoutEmoji, every symbol goes, so "Database Review" + U+2692 still matches "Database Review".
export function withoutSymbols(name: string): string {
  return dropSymbols(name, (char) => SYMBOL.test(char))
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function parseChannels(json: unknown): readonly TeamsChannel[] {
  const channels: TeamsChannel[] = []
  for (const team of array(json, 'teams') ?? []) {
    const teamName = withoutEmoji(str(team, 'displayName') ?? '')
    for (const channel of array(team, 'channels') ?? []) {
      const id = str(channel, 'id')
      if (id !== null && id !== '') {
        channels.push({
          id,
          teamName,
          channelName: withoutEmoji(str(channel, 'displayName') ?? ''),
        })
      }
    }
  }
  return channels
}

function isoFromText(text: string | null): string | null {
  if (text === null) {
    return null
  }
  // A time with no offset is UTC, as the C# parser assumes.
  const hasOffset = /(Z|[+-]\d\d:?\d\d)$/i.test(text)
  const ms = Date.parse(/^\d{4}-\d\d-\d\dT/.test(text) && !hasOffset ? `${text}Z` : text)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

function parseEditTime(properties: Json): string | null {
  const raw = properties['edittime']
  let ms: number
  if (typeof raw === 'number') {
    ms = raw
  } else if (typeof raw === 'string' && /^\d+$/.test(raw)) {
    ms = Number(raw)
  } else {
    return null
  }
  const date = new Date(ms)
  return Number.isFinite(ms) && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

// Only people: a channel or team tag has no person mri.
function parseMentionMris(properties: Json): Readonly<Record<string, string>> {
  const mentionMris: Record<string, string> = {}
  for (const mention of arrayOrJsonString(properties, 'mentions') ?? []) {
    const mentionType = isJson(mention) ? mention['mentionType'] : null
    const rawItemId = isJson(mention) ? mention['itemid'] : null
    // Teams' own client writes the item id as a number (0), this app as a string ("0").
    const itemId = typeof rawItemId === 'number' ? String(rawItemId) : str(mention, 'itemid')
    const mri = str(mention, 'mri')
    const isPerson = typeof mentionType !== 'string' || mentionType === 'person'
    if (isPerson && itemId !== null && itemId !== '' && mri !== null && mri !== '') {
      mentionMris[itemId] = mri
    }
  }
  return mentionMris
}

function isHttpsUrl(value: string | null): value is string {
  if (value === null) {
    return false
  }
  // Core has no URL global in its build lib: a scheme check plus a non-empty host is enough here.
  return /^https:\/\/[^/\s?#]+/i.test(value)
}

// The share link first: a chat file's members open it through that.
function parseFiles(properties: Json): { hasFiles: boolean; files: readonly TeamsMessageFile[] } {
  const rawFiles = arrayOrJsonString(properties, 'files') ?? []
  const files: TeamsMessageFile[] = []
  for (const rawFile of rawFiles) {
    const fileName = str(rawFile, 'fileName') ?? str(rawFile, 'title')
    const fileInfo = isJson(rawFile) ? rawFile['fileInfo'] : null
    const candidates = [
      str(fileInfo, 'shareUrl'),
      str(rawFile, 'objectUrl'),
      str(fileInfo, 'fileUrl'),
    ]
    const url = candidates.find(isHttpsUrl)
    if (fileName !== null && fileName.trim() !== '' && url !== undefined) {
      files.push({ fileName, url })
    }
  }
  return { hasFiles: rawFiles.length !== 0, files }
}

function parseReactions(properties: Json): readonly TeamsReaction[] {
  const reactions: TeamsReaction[] = []
  for (const emotion of arrayOrJsonString(properties, 'emotions') ?? []) {
    const key = str(emotion, 'key')
    const users = array(emotion, 'users')
    if (key === null || !REACTION_KEY.test(key) || users === null) {
      continue
    }
    const userMris: string[] = []
    for (const user of users) {
      const mri = str(user, 'mri')?.toLowerCase()
      if (mri !== undefined && mri !== '' && !userMris.includes(mri)) {
        userMris.push(mri)
      }
    }
    if (userMris.length !== 0) {
      reactions.push({ key, userMris })
    }
  }
  return reactions
}

function isDeleted(properties: Json): boolean {
  const deleteTime = properties['deletetime']
  return deleteTime !== undefined && deleteTime !== null && deleteTime !== ''
}

function parseMessage(raw: unknown): TeamsMessage | null {
  const messageType = str(raw, 'messagetype')
  const id = str(raw, 'id')
  const content = str(raw, 'content')
  const sentAt = isoFromText(str(raw, 'composetime'))
  if (
    (messageType !== 'RichText/Html' && messageType !== 'Text') ||
    id === null ||
    id === '' ||
    content === null ||
    content === '' ||
    sentAt === null
  ) {
    return null
  }
  const properties: Json = isJson(raw) && isJson(raw['properties']) ? raw['properties'] : {}
  if (isDeleted(properties)) {
    return null
  }
  const from = str(raw, 'from') ?? ''
  const subject = str(properties, 'subject')
  return {
    id,
    senderId: from.slice(from.lastIndexOf('/') + 1).toLowerCase(),
    senderName: str(raw, 'imdisplayname') ?? '',
    sentAt,
    content,
    isPlainText: !KNOWN_HTML_TAG.test(content),
    subject: subject === null || subject === '' ? null : subject,
    editedAt: parseEditTime(properties),
    mentionMris: parseMentionMris(properties),
    reactions: parseReactions(properties),
    rootMessageId: str(raw, 'rootMessageId'),
    ...parseFiles(properties),
  }
}

/** A malformed message is dropped, the rest of the page survives; oldest first. */
export function parseMessages(json: unknown): TeamsMessagePage {
  const messages: TeamsMessage[] = []
  for (const raw of array(json, 'messages') ?? []) {
    const message = parseMessage(raw)
    if (message !== null) {
      messages.push(message)
    }
  }
  messages.sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
  const metadata = isJson(json) ? json['_metadata'] : null
  return { messages, backwardLink: str(metadata, 'backwardLink') }
}

/** Group chats only: a "@thread.v2" id that is not a meeting. A chat without a topic cannot be matched to a ticket. */
export function parseChats(json: unknown): {
  readonly chats: readonly TeamsGroupChat[]
  readonly backwardLink: string | null
} {
  const chats: TeamsGroupChat[] = []
  for (const conversation of array(json, 'conversations') ?? []) {
    const id = str(conversation, 'id')
    if (id === null || !id.endsWith('@thread.v2') || id.startsWith('19:meeting_')) {
      continue
    }
    const properties = isJson(conversation) ? conversation['threadProperties'] : null
    const topic = (str(properties, 'topic') ?? '').trim()
    if (topic !== '') {
      chats.push({ id, topic })
    }
  }
  const metadata = isJson(json) ? json['_metadata'] : null
  return { chats, backwardLink: str(metadata, 'backwardLink') }
}
