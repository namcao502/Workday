import { join } from 'node:path'
import type { Notice, NoticeEvent, NoticeTarget, NoticeTone, NoticeTopic } from '@workday/core'
import { isRecord, readJson, writeJsonAtomic } from '../jsonFile.js'

const NOTICES_FILE = 'notices.json'
const TOPICS: ReadonlySet<string> = new Set([
  'claude',
  'pr',
  'jira',
  'suggestions',
  'knowledge',
  'other',
])
const TONES: ReadonlySet<string> = new Set(['info', 'success', 'error'])
const TARGET_KINDS: ReadonlySet<string> = new Set([
  'board',
  'workspace',
  'url',
  'schedules',
  'teams',
])

function isTarget(raw: unknown): raw is NoticeTarget {
  if (!isRecord(raw) || typeof raw['kind'] !== 'string' || !TARGET_KINDS.has(raw['kind'])) {
    return false
  }
  switch (raw['kind']) {
    case 'board':
      return raw['key'] === null || typeof raw['key'] === 'string'
    case 'schedules':
      return true
    case 'teams':
      return typeof raw['key'] === 'string' && typeof raw['conversationId'] === 'string'
    case 'workspace':
      return typeof raw['tab'] === 'string' && typeof raw['session'] === 'string'
    default:
      return typeof raw['url'] === 'string'
  }
}

// One bad entry is dropped, not the whole file; the event is only checked for its type tag.
function parseNotice(raw: unknown): Notice | null {
  if (!isRecord(raw)) {
    return null
  }
  const { id, at, topic, tone, event, target, place, read } = raw
  if (
    typeof id !== 'number' ||
    !Number.isInteger(id) ||
    typeof at !== 'string' ||
    Number.isNaN(Date.parse(at)) ||
    typeof topic !== 'string' ||
    !TOPICS.has(topic) ||
    typeof tone !== 'string' ||
    !TONES.has(tone) ||
    !isRecord(event) ||
    typeof event['type'] !== 'string' ||
    (target !== null && !isTarget(target)) ||
    (place !== null && typeof place !== 'string') ||
    typeof read !== 'boolean'
  ) {
    return null
  }
  return {
    id,
    at,
    topic: topic as NoticeTopic,
    tone: tone as NoticeTone,
    event: event as unknown as NoticeEvent,
    target,
    place,
    read,
  }
}

function parseNoticesFile(raw: unknown): readonly Notice[] | null {
  if (!Array.isArray(raw)) {
    return null
  }
  return raw.map(parseNotice).filter((notice): notice is Notice => notice !== null)
}

export function loadNotices(dataDir: string): readonly Notice[] {
  return readJson(join(dataDir, NOTICES_FILE), parseNoticesFile, [])
}

export async function saveNotices(dataDir: string, notices: readonly Notice[]): Promise<void> {
  await writeJsonAtomic(join(dataDir, NOTICES_FILE), notices)
}
