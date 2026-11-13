import { join } from 'node:path'
import type { AgentStats } from '@workday/core'
import { isRecord, readJson, writeJsonAtomic } from '../jsonFile.js'

const STATS_FILE = 'agent-stats.json'

export type SavedSessions = Readonly<Record<string, AgentStats>>
type SavedByTicket = Readonly<Record<string, SavedSessions>>

function isNumber(value: unknown): value is number {
  return typeof value === 'number'
}

// Shape check of the fields the report reads; a damaged entry makes the whole file .bad.
function isAgentStats(value: unknown): value is AgentStats {
  return (
    isRecord(value) &&
    isNumber(value['turns']) &&
    isNumber(value['turnSeconds']) &&
    isNumber(value['inputTokens']) &&
    isNumber(value['outputTokens']) &&
    isNumber(value['cacheReadTokens']) &&
    isNumber(value['cacheWriteTokens']) &&
    Array.isArray(value['compacts']) &&
    Array.isArray(value['skills']) &&
    Array.isArray(value['subagents']) &&
    Array.isArray(value['apiErrors']) &&
    isRecord(value['tools']) &&
    (value['days'] === null || isRecord(value['days'])) &&
    (value['lastActivity'] === null || typeof value['lastActivity'] === 'string')
  )
}

function parseSaved(raw: unknown): SavedByTicket | null {
  if (!isRecord(raw)) {
    return null
  }
  const tickets: Record<string, SavedSessions> = {}
  for (const [ticketKey, sessions] of Object.entries(raw)) {
    if (!isRecord(sessions)) {
      return null
    }
    const parsed: Record<string, AgentStats> = {}
    for (const [sessionId, stats] of Object.entries(sessions)) {
      if (!isAgentStats(stats)) {
        return null
      }
      parsed[sessionId] = stats
    }
    tickets[ticketKey] = parsed
  }
  return tickets
}

// Each ticket's per-session stats, so a session whose transcript Claude cleaned up still counts.
export class AgentStatsStore {
  private saved: SavedByTicket
  private writes: Promise<unknown> = Promise.resolve()

  constructor(private readonly dataDir: string) {
    this.saved = readJson(join(dataDir, STATS_FILE), parseSaved, {})
  }

  keys(): readonly string[] {
    return Object.keys(this.saved)
  }

  sessions(ticketKey: string): SavedSessions {
    return this.saved[ticketKey] ?? {}
  }

  // Serial writes; the in-memory copy is swapped first so a reader never sees an older one.
  save(ticketKey: string, sessions: SavedSessions): Promise<void> {
    this.saved = { ...this.saved, [ticketKey]: sessions }
    const snapshot = this.saved
    const write = this.writes.then(() => writeJsonAtomic(join(this.dataDir, STATS_FILE), snapshot))
    this.writes = write.catch(() => undefined)
    return write
  }
}
