import { join } from 'node:path'
import type {
  TeamsChannelIndex,
  TeamsIndexedPost,
  TeamsPerson,
  TeamsPostIndex,
} from '@workday/core'
import { isRecord, readJson, writeJsonAtomic } from '../jsonFile.js'

const POSTS_FILE = 'teams-posts.json'
const STATE_FILE = 'teams-state.json'

// Marks: conversationKey (seenAt, notifiedAt) or postedKey (postedAt) -> ISO; baselineDone: the first reminder check ran.
export interface TeamsState {
  readonly seenAt: Readonly<Record<string, string>>
  readonly notifiedAt: Readonly<Record<string, string>>
  readonly postedAt: Readonly<Record<string, string>>
  readonly baselineDone: boolean
  readonly people: readonly TeamsPerson[]
}

export const EMPTY_TEAMS_STATE: TeamsState = {
  seenAt: {},
  notifiedAt: {},
  postedAt: {},
  baselineDone: false,
  people: [],
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isIndexedPost(raw: unknown): raw is TeamsIndexedPost {
  return (
    isRecord(raw) &&
    typeof raw['rootId'] === 'string' &&
    typeof raw['sentAt'] === 'string' &&
    typeof raw['mine'] === 'boolean'
  )
}

function isChannelIndex(raw: unknown): raw is TeamsChannelIndex {
  return (
    isRecord(raw) &&
    isNullableText(raw['syncedAt']) &&
    typeof raw['deepScanned'] === 'boolean' &&
    typeof raw['deepScanPages'] === 'number' &&
    isNullableText(raw['deepScanLink']) &&
    isRecord(raw['posts']) &&
    Object.values(raw['posts']).every(isIndexedPost)
  )
}

function isPostIndex(raw: unknown): raw is TeamsPostIndex {
  return isRecord(raw) && Object.values(raw).every(isChannelIndex)
}

function parsePostIndex(raw: unknown): TeamsPostIndex | null {
  return isPostIndex(raw) ? raw : null
}

function isTextMap(raw: unknown): raw is Readonly<Record<string, string>> {
  return isRecord(raw) && Object.values(raw).every((value) => typeof value === 'string')
}

function isPerson(raw: unknown): raw is TeamsPerson {
  return isRecord(raw) && typeof raw['mri'] === 'string' && typeof raw['displayName'] === 'string'
}

function parseState(raw: unknown): TeamsState | null {
  if (!isRecord(raw)) {
    return null
  }
  const { seenAt, notifiedAt, postedAt, people, baselineDone } = raw
  if (
    !isTextMap(seenAt) ||
    !isTextMap(notifiedAt) ||
    !isTextMap(postedAt) ||
    !Array.isArray(people) ||
    !people.every(isPerson) ||
    (baselineDone !== undefined && typeof baselineDone !== 'boolean')
  ) {
    return null
  }
  return { seenAt, notifiedAt, postedAt, baselineDone: baselineDone === true, people }
}

export function loadPostIndex(dataDir: string): TeamsPostIndex {
  return readJson(join(dataDir, POSTS_FILE), parsePostIndex, {})
}

export function savePostIndex(dataDir: string, index: TeamsPostIndex): Promise<void> {
  return writeJsonAtomic(join(dataDir, POSTS_FILE), index)
}

export function loadTeamsState(dataDir: string): TeamsState {
  return readJson(join(dataDir, STATE_FILE), parseState, EMPTY_TEAMS_STATE)
}

export function saveTeamsState(dataDir: string, state: TeamsState): Promise<void> {
  return writeJsonAtomic(join(dataDir, STATE_FILE), state)
}
