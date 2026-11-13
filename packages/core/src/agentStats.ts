export interface AgentDayUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly turns: number
  readonly turnSeconds: number
}

export interface AgentCompact {
  readonly at: string
  readonly isAuto: boolean
  readonly preTokens: number
  readonly postTokens: number
  readonly durationMs: number
}

export interface AgentSkillRun {
  readonly at: string
  readonly skill: string
  readonly args: string | null
}

export interface AgentSubagent {
  readonly startedAt: string | null
  readonly agentType: string
  readonly description: string
  readonly model: string | null
  readonly isFinished: boolean
  readonly toolCalls: number
  readonly outputTokens: number
}

export interface AgentApiError {
  readonly at: string
  readonly status: number | null
  readonly text: string
}

export interface AgentToolUsage {
  readonly calls: number
  readonly errors: number
}

export interface AgentStats {
  readonly contextTokens: number | null
  readonly contextWindow: number
  readonly model: string | null
  readonly sessions: number
  readonly turns: number
  readonly turnSeconds: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly compacts: readonly AgentCompact[]
  readonly skills: readonly AgentSkillRun[]
  readonly subagents: readonly AgentSubagent[]
  readonly tools: Readonly<Record<string, AgentToolUsage>>
  readonly apiErrors: readonly AgentApiError[]
  readonly lastActivity: string | null
  readonly days: Readonly<Record<string, AgentDayUsage>> | null // "YYYY-MM-DD" in the given time zone; null = saved before per-day
}

export const EMPTY_DAY_USAGE: AgentDayUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  turns: 0,
  turnSeconds: 0,
}

export function addDayUsage(a: AgentDayUsage, b: AgentDayUsage): AgentDayUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    turns: a.turns + b.turns,
    turnSeconds: a.turnSeconds + b.turnSeconds,
  }
}

function timeOf(iso: string | null, fallback: number): number {
  return iso === null ? fallback : Date.parse(iso)
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

// Context, model and window come from the newest session; everything else adds up. An empty list gives empty stats.
export function combineAgentStats(sessions: readonly AgentStats[]): AgentStats {
  const newest = sessions.reduce<AgentStats | null>(
    (best, session) =>
      best === null || timeOf(session.lastActivity, 0) > timeOf(best.lastActivity, 0)
        ? session
        : best,
    null,
  )

  const tools: Record<string, AgentToolUsage> = {}
  const days: Record<string, AgentDayUsage> = {}
  for (const session of sessions) {
    for (const [name, usage] of Object.entries(session.tools)) {
      const total = tools[name] ?? { calls: 0, errors: 0 }
      tools[name] = { calls: total.calls + usage.calls, errors: total.errors + usage.errors }
    }
    for (const [day, usage] of Object.entries(session.days ?? {})) {
      days[day] = addDayUsage(days[day] ?? EMPTY_DAY_USAGE, usage)
    }
  }

  const lastTimes = sessions.flatMap((session) =>
    session.lastActivity === null ? [] : [session.lastActivity],
  )
  const lastActivity = lastTimes.reduce<string | null>(
    (best, at) => (best === null || Date.parse(at) > Date.parse(best) ? at : best),
    null,
  )

  return {
    contextTokens: newest?.contextTokens ?? null,
    contextWindow: newest?.contextWindow ?? 0,
    model: newest?.model ?? null,
    sessions: sum(sessions.map((session) => session.sessions)),
    turns: sum(sessions.map((session) => session.turns)),
    turnSeconds: sum(sessions.map((session) => session.turnSeconds)),
    inputTokens: sum(sessions.map((session) => session.inputTokens)),
    outputTokens: sum(sessions.map((session) => session.outputTokens)),
    cacheReadTokens: sum(sessions.map((session) => session.cacheReadTokens)),
    cacheWriteTokens: sum(sessions.map((session) => session.cacheWriteTokens)),
    compacts: sessions
      .flatMap((s) => s.compacts)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    skills: sessions.flatMap((s) => s.skills).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    subagents: sessions
      .flatMap((s) => s.subagents)
      .sort(
        (a, b) =>
          timeOf(a.startedAt, Number.MAX_SAFE_INTEGER) -
          timeOf(b.startedAt, Number.MAX_SAFE_INTEGER),
      ),
    tools,
    apiErrors: sessions
      .flatMap((s) => s.apiErrors)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    lastActivity,
    days,
  }
}
