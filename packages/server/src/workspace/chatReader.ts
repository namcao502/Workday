import { parseTranscript, type ChatMessage, type ChatView } from '@workday/core'
import { readTranscriptLines } from './transcriptReader.js'

export const CHAT_PAGE_SIZE = 150

const EMPTY: ChatView = {
  messages: [],
  hasMore: false,
  working: false,
  requests: [],
  running: false,
  mode: 'default',
  model: null,
}

// The page counts prompts and replies only: a busy turn's tool rows must not push earlier prompts off it.
function pageStart(messages: readonly ChatMessage[]): number {
  let start = messages.length
  let shown = 0
  while (start > 0 && (shown < CHAT_PAGE_SIZE || messages[start - 1]?.role === 'tool')) {
    start -= 1
    if (messages[start]?.role !== 'tool') {
      shown += 1
    }
  }
  return start
}

// A null or unreadable path is an empty chat; the caller has already checked the path is accepted.
export function readChat(path: string | null, cwd: string | null, working: boolean): ChatView {
  if (path === null) {
    return { ...EMPTY, working }
  }
  let parsed: readonly ChatMessage[]
  try {
    const { lines, offsets } = readTranscriptLines(path)
    parsed = parseTranscript(lines, offsets, cwd)
  } catch {
    return { ...EMPTY, working }
  }
  // A step left without a result was stopped: nothing runs once the turn is over.
  const messages = working
    ? parsed
    : parsed.map((message) =>
        message.status === 'running' ? { ...message, status: null } : message,
      )
  const start = pageStart(messages)
  return { ...EMPTY, messages: messages.slice(start), hasMore: start !== 0, working }
}
