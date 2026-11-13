import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  claudeProjectDirName,
  tallyTranscript,
  type AgentStats,
  type AgentSubagent,
  type AgentToolUsage,
} from '@workday/core'
import { isRecord } from '../jsonFile.js'
import { readTranscriptLinesAsync } from '../workspace/transcriptReader.js'
import type { AgentStatsStore, SavedSessions } from './agentStatsStore.js'

const UNKNOWN_TEXT = '?'
const READ_CONCURRENCY = 4
const FIRST_TIMESTAMP = /"timestamp"\s*:\s*"([^"]+)"/

interface CachedTally {
  readonly size: number
  readonly modifiedMs: number
  readonly stats: AgentStats
  readonly startedAt: string | null
}

export interface AgentStatsReaderDeps {
  readonly projectsRoot: string // ~/.claude/projects
  readonly store: AgentStatsStore
  readonly worktreePaths: (ticketKey: string) => Promise<readonly string[]>
  readonly timeZone: () => string
}

async function listFiles(directory: string, accept: (name: string) => boolean): Promise<string[]> {
  try {
    return (await readdir(directory))
      .filter(accept)
      .sort()
      .map((name) => join(directory, name))
  } catch {
    return [] // a folder that is not there has no sessions
  }
}

function startOf(lines: readonly string[]): string | null {
  for (const line of lines) {
    const text = FIRST_TIMESTAMP.exec(line)?.[1]
    if (text !== undefined && !Number.isNaN(Date.parse(text))) {
      return new Date(text).toISOString()
    }
  }
  return null
}

async function readMeta(transcriptPath: string): Promise<Readonly<Record<string, unknown>>> {
  try {
    const raw: unknown = JSON.parse(
      await readFile(transcriptPath.replace(/\.jsonl$/, '.meta.json'), 'utf8'),
    )
    return isRecord(raw) ? raw : {}
  } catch {
    return {} // a subagent with no meta yet shows as unknown rather than being dropped
  }
}

function text(meta: Readonly<Record<string, unknown>>, name: string): string | null {
  const value = meta[name]
  return typeof value === 'string' ? value : null
}

// Runs the work over the items with at most `limit` in flight; results keep the item order.
async function mapLimited<Item, Result>(
  items: readonly Item[],
  limit: number,
  work: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await work(items[index] as Item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function addTools(
  into: Record<string, AgentToolUsage>,
  from: Readonly<Record<string, AgentToolUsage>>,
): void {
  for (const [name, usage] of Object.entries(from)) {
    const total = into[name] ?? { calls: 0, errors: 0 }
    into[name] = { calls: total.calls + usage.calls, errors: total.errors + usage.errors }
  }
}

function latest(times: readonly (string | null)[]): string | null {
  return times.reduce<string | null>(
    (best, at) => (at !== null && (best === null || Date.parse(at) > Date.parse(best)) ? at : best),
    null,
  )
}

// Reads a ticket's Claude transcripts (and each session's subagents), keeps the saved sessions whose files are gone.
export class AgentStatsReader {
  private readonly cache = new Map<string, CachedTally>()

  constructor(private readonly deps: AgentStatsReaderDeps) {}

  keys(): readonly string[] {
    return this.deps.store.keys()
  }

  // One AgentStats per session; live data wins over the saved copy. Saves only a new or changed session.
  async readAndSave(ticketKey: string): Promise<readonly AgentStats[]> {
    const live = await this.readLive(await this.deps.worktreePaths(ticketKey))
    const saved = this.deps.store.sessions(ticketKey)
    const sessions: Record<string, AgentStats> = { ...saved, ...live }
    const isChanged = Object.entries(live).some(
      ([id, stats]) => saved[id]?.lastActivity !== stats.lastActivity,
    )
    if (isChanged) {
      await this.deps.store.save(ticketKey, sessions)
    }
    return Object.values(sessions)
  }

  // Keyed by the session file's name; a session with no data is left out. Four files are read at a time.
  private async readLive(worktreePaths: readonly string[]): Promise<SavedSessions> {
    const jobs: { projectDirectory: string; id: string; file: string }[] = []
    for (const worktreePath of worktreePaths) {
      const projectDirectory = join(this.deps.projectsRoot, claudeProjectDirName(worktreePath))
      const files = await listFiles(projectDirectory, (name) => name.endsWith('.jsonl'))
      for (const file of files) {
        jobs.push({
          projectDirectory,
          id: file.slice(projectDirectory.length + 1, -'.jsonl'.length),
          file,
        })
      }
    }
    const read = await mapLimited(jobs, READ_CONCURRENCY, (job) =>
      this.readSession(job.projectDirectory, job.id, job.file),
    )
    const sessions: Record<string, AgentStats> = {}
    jobs.forEach((job, index) => {
      const session = read[index] ?? null
      if (session !== null) {
        sessions[job.id] = session
      }
    })
    return sessions
  }

  private async readSession(
    projectDirectory: string,
    id: string,
    file: string,
  ): Promise<AgentStats | null> {
    const own = await this.tally(file)
    if (own === null || own.stats.lastActivity === null) {
      return null
    }
    const subagentDirectory = join(projectDirectory, id, 'subagents')
    const files = await listFiles(
      subagentDirectory,
      (name) => name.startsWith('agent-') && name.endsWith('.jsonl'),
    )
    const tallies: { file: string; tally: CachedTally }[] = []
    for (const subagentFile of files) {
      const tally = await this.tally(subagentFile)
      if (tally !== null) {
        tallies.push({ file: subagentFile, tally })
      }
    }

    const tools: Record<string, AgentToolUsage> = {}
    addTools(tools, own.stats.tools)
    for (const { tally } of tallies) {
      addTools(tools, tally.stats.tools)
    }
    const built = await Promise.all(
      tallies.map(({ file: subagentFile, tally }) => buildSubagent(subagentFile, tally)),
    )
    const subagents = built.sort((a, b) =>
      (a.startedAt ?? '9999').localeCompare(b.startedAt ?? '9999'),
    )
    return {
      ...own.stats,
      subagents,
      tools,
      lastActivity: latest([
        own.stats.lastActivity,
        ...tallies.map((t) => t.tally.stats.lastActivity),
      ]),
    }
  }

  // Re-tallied only when the file's size or time changed; null when it cannot be read.
  private async tally(path: string): Promise<CachedTally | null> {
    try {
      const { size, mtimeMs } = await stat(path)
      const cached = this.cache.get(path)
      if (cached !== undefined && cached.size === size && cached.modifiedMs === mtimeMs) {
        return cached
      }
      const { lines } = await readTranscriptLinesAsync(path)
      const fresh = {
        size,
        modifiedMs: mtimeMs,
        stats: tallyTranscript(lines, this.deps.timeZone()),
        startedAt: startOf(lines),
      }
      this.cache.set(path, fresh)
      return fresh
    } catch {
      return null
    }
  }
}

async function buildSubagent(transcriptPath: string, tally: CachedTally): Promise<AgentSubagent> {
  const meta = await readMeta(transcriptPath)
  const calls = Object.values(tally.stats.tools).reduce((total, usage) => total + usage.calls, 0)
  return {
    startedAt: tally.startedAt,
    agentType: text(meta, 'agentType') ?? UNKNOWN_TEXT,
    description: text(meta, 'description') ?? UNKNOWN_TEXT,
    model: text(meta, 'model'),
    isFinished: meta['finished'] === true,
    toolCalls: calls,
    outputTokens: tally.stats.outputTokens,
  }
}
