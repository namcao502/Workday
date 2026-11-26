import { parseTranscript } from './transcriptChat.js'

// One earlier chat of a folder, offered by /resume.
export interface PastChat {
  readonly id: string // the Claude session id
  readonly title: string | null // null: no prompt was ever sent
  readonly modifiedAt: string // ISO time of the transcript's last write
  readonly current: boolean // the chat this session shows now
}

const MAX_TITLE_LENGTH = 80
const ELLIPSIS = '...'

function customTitleOf(line: string): string | null {
  if (!line.includes('"custom-title"')) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(line)
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }
    const record = parsed as Record<string, unknown>
    const value = record['customTitle']
    return record['type'] === 'custom-title' && typeof value === 'string' && value.trim() !== ''
      ? value.trim()
      : null
  } catch {
    return null
  }
}

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_TITLE_LENGTH
    ? `${flat.slice(0, MAX_TITLE_LENGTH - ELLIPSIS.length)}${ELLIPSIS}`
    : flat
}

// The last /rename title in the file, else its first prompt; head and tail are the file's first and last lines.
export function pastChatTitle(
  headLines: readonly string[],
  tailLines: readonly string[],
): string | null {
  const titles = [...headLines, ...tailLines].map(customTitleOf).filter((title) => title !== null)
  const last = titles.at(-1)
  if (last !== undefined) {
    return last
  }
  const offsets = headLines.map((_, index) => index)
  const first = parseTranscript(headLines, offsets, null).find(
    (message) => message.role === 'user' && message.text !== null && message.text.trim() !== '',
  )
  return first?.text === undefined || first.text === null ? null : oneLine(first.text)
}
