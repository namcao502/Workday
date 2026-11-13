import { describe, expect, it } from 'vitest'
import {
  combineAgentStats,
  type AgentDayUsage,
  type AgentStats,
  type AgentToolUsage,
} from './agentStats.js'

const EARLY = '2026-10-01T00:00:00.000Z'
const LATE = '2026-10-02T00:00:00.000Z'

function session(
  inputTokens: number,
  lastActivity: string | null,
  extra: {
    contextTokens?: number
    model?: string
    tools?: Record<string, AgentToolUsage>
    days?: Record<string, AgentDayUsage> | null
  } = {},
): AgentStats {
  return {
    contextTokens: extra.contextTokens ?? null,
    contextWindow: 200_000,
    model: extra.model ?? null,
    sessions: 1,
    turns: 2,
    turnSeconds: 60,
    inputTokens,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    compacts: [],
    skills: [],
    subagents: [],
    tools: extra.tools ?? {},
    apiErrors: [],
    lastActivity,
    days: extra.days ?? null,
  }
}

function day(
  input: number,
  output: number,
  read: number,
  write: number,
  turns: number,
  secs: number,
) {
  return {
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: read,
    cacheWriteTokens: write,
    turns,
    turnSeconds: secs,
  }
}

describe('combineAgentStats', () => {
  it('adds days across sessions and skips a session without days', () => {
    const stats = combineAgentStats([
      session(1, LATE, { days: { '2026-10-22': day(1, 2, 3, 4, 1, 1) } }),
      session(1, EARLY, {
        days: { '2026-10-22': day(10, 20, 30, 40, 2, 2), '2026-10-23': day(5, 0, 0, 0, 1, 0.5) },
      }),
      session(1, EARLY),
    ])

    expect(stats.days?.['2026-10-22']).toEqual(day(11, 22, 33, 44, 3, 3))
    expect(stats.days?.['2026-10-23']).toEqual(day(5, 0, 0, 0, 1, 0.5))
  })

  it('adds totals and tools across sessions', () => {
    const stats = combineAgentStats([
      session(50, LATE),
      session(7, EARLY, { tools: { Bash: { calls: 2, errors: 1 } } }),
    ])

    expect(stats.inputTokens).toBe(57)
    expect(stats.sessions).toBe(2)
    expect(stats.turns).toBe(4)
    expect(stats.tools['Bash']).toEqual({ calls: 2, errors: 1 })
  })

  it('takes context, model and last activity from the newest session', () => {
    const stats = combineAgentStats([
      session(1, EARLY, { contextTokens: 90_000, model: 'opus' }),
      session(1, LATE, { contextTokens: 5_000, model: 'sonnet' }),
    ])

    expect(stats.contextTokens).toBe(5_000)
    expect(stats.model).toBe('sonnet')
    expect(stats.lastActivity).toBe(LATE)
  })

  it('returns empty stats for no sessions', () => {
    const stats = combineAgentStats([])

    expect(stats.sessions).toBe(0)
    expect(stats.lastActivity).toBeNull()
    expect(stats.contextTokens).toBeNull()
  })
})
