import { statSync } from 'node:fs'
import {
  parseTranscript,
  transcriptUsage,
  type ChatMessage,
  type ChatView,
  type TranscriptUsage,
} from '@workday/core'
import { readTranscriptLines } from './transcriptReader.js'

export const CHAT_PAGE_SIZE = 150

const EMPTY: ChatView = {
  messages: [],
  hasMore: false,
  working: false,
  background: [],
  requests: [],
  running: false,
  mode: 'default',
  model: null,
  contextTokens: null,
  branch: null,
  added: 0,
  removed: 0,
  usage: null,
  catalog: null,
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

interface ParsedTranscript {
  readonly size: number
  readonly modifiedMs: number
  readonly cwd: string | null
  readonly messages: readonly ChatMessage[]
  readonly usage: TranscriptUsage
}

// Parsing a multi-megabyte transcript costs hundreds of ms, and every client refetch asks again: an unchanged file
// (same size and time) is parsed once. Only the latest few sessions are kept.
const MAX_CACHED = 8
const parsedByPath = new Map<string, ParsedTranscript>()

function parseCached(path: string, cwd: string | null): ParsedTranscript {
  const { size, mtimeMs } = statSync(path)
  const cached = parsedByPath.get(path)
  if (
    cached !== undefined &&
    cached.size === size &&
    cached.modifiedMs === mtimeMs &&
    cached.cwd === cwd
  ) {
    return cached
  }
  const { lines, offsets } = readTranscriptLines(path)
  const parsed: ParsedTranscript = {
    size,
    modifiedMs: mtimeMs,
    cwd,
    messages: parseTranscript(lines, offsets, cwd),
    usage: transcriptUsage(lines),
  }
  parsedByPath.delete(path)
  parsedByPath.set(path, parsed)
  for (const oldest of [...parsedByPath.keys()].slice(
    0,
    Math.max(0, parsedByPath.size - MAX_CACHED),
  )) {
    parsedByPath.delete(oldest)
  }
  return parsed
}

// A null or unreadable path is an empty chat; the caller has already checked the path is accepted.
export function readChat(path: string | null, cwd: string | null, working: boolean): ChatView {
  if (path === null) {
    return { ...EMPTY, working }
  }
  let parsed: readonly ChatMessage[]
  let usage: TranscriptUsage
  try {
    const read = parseCached(path, cwd)
    parsed = read.messages
    usage = read.usage
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
  return {
    ...EMPTY,
    messages: messages.slice(start),
    hasMore: start !== 0,
    working,
    model: usage.model,
    contextTokens: usage.contextTokens,
  }
}
