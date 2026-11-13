import { describe, expect, it } from 'vitest'
import type { AgentCompact, AgentDayUsage, AgentStats } from './agentStats.js'
import type { ReportRange } from './reportRanges.js'
import type { TicketCommitStats } from './ticketCommits.js'
import {
  agentInRange,
  buildReport,
  totalTokens,
  type TicketReportFacts,
  type TicketReportInput,
} from './ticketReports.js'
import type { HrmTask } from './timesheetWeek.js'

const WEEK: ReportRange = { kind: 'thisWeek', from: '2026-11-02', to: '2026-11-08' }

function day(tokens: number, turns = 1, turnSeconds = 60): AgentDayUsage {
  return {
    inputTokens: tokens,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    turns,
    turnSeconds,
  }
}

function session(
  lastActivity: string | null,
  days: Readonly<Record<string, AgentDayUsage>> | null,
  overrides: Partial<AgentStats> = {},
): AgentStats {
  return {
    contextTokens: 10,
    contextWindow: 1000,
    model: 'opus',
    sessions: 1,
    turns: 3,
    turnSeconds: 180,
    inputTokens: 100,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    compacts: [],
    skills: [],
    subagents: [],
    tools: { Read: { calls: 2, errors: 1 } },
    apiErrors: [],
    lastActivity,
    days,
    ...overrides,
  }
}

function oneDay(date: string, tokens: number): AgentStats[] {
  return [session(null, { [date]: day(tokens) })]
}

function commits(count: number): TicketCommitStats {
  return { commits: count, files: 2, added: 10, deleted: 5 }
}

function input(overrides: Partial<TicketReportInput> = {}): TicketReportInput {
  return { range: WEEK, agent: {}, hrmTasks: null, commits: {}, facts: {}, ...overrides }
}

function task(date: string, ticketKey: string, summary: string | null, seconds: number): HrmTask {
  return { date, ticketKey, summary, workingSeconds: seconds }
}

describe('agentInRange', () => {
  it('sums only the days inside', () => {
    const stats = agentInRange(
      [
        session('2026-11-20T05:00:00Z', {
          '2026-11-03': day(100, 2, 120),
          '2026-11-04': day(50, 1, 60),
          '2026-11-20': day(999, 9, 999),
        }),
      ],
      WEEK,
    )

    expect(stats?.sessions).toBe(1)
    expect(stats?.turns).toBe(3)
    expect(stats?.turnSeconds).toBe(180)
    expect(stats?.inputTokens).toBe(150)
    expect(Object.keys(stats?.days ?? {})).toEqual(['2026-11-03', '2026-11-04'])
  })

  it('puts an old session on its last activity day', () => {
    const inside = session('2026-11-04T03:00:00Z', null, { turns: 4, inputTokens: 70 })
    const outside = session('2026-11-20T03:00:00Z', null, { turns: 8, inputTokens: 900 })
    // 18:00 UTC on Nov 8 is already Nov 9 in Ho Chi Minh, outside the week.
    const lateSunday = session('2026-11-08T18:00:00Z', null, { turns: 6, inputTokens: 500 })

    const stats = agentInRange([inside, outside, lateSunday], WEEK)

    expect(stats?.sessions).toBe(1)
    expect(stats?.turns).toBe(4)
    expect(stats?.inputTokens).toBe(70)
    expect(stats?.days?.['2026-11-04']?.inputTokens).toBe(70)
    expect(Object.keys(stats?.days ?? {})).toHaveLength(1)
  })

  it('filters skills and compacts by time and returns null outside', () => {
    const inside = '2026-11-03T05:00:00Z'
    const outside = '2026-11-20T05:00:00Z'
    const compact = (at: string): AgentCompact => ({
      at,
      isAuto: true,
      preTokens: 1,
      postTokens: 1,
      durationMs: 1,
    })
    const stats = session(
      outside,
      { '2026-11-03': day(10), '2026-11-20': day(10) },
      {
        compacts: [compact(inside), compact(outside)],
        skills: [
          { at: inside, skill: 'plan', args: null },
          { at: outside, skill: 'ship', args: null },
        ],
        subagents: [
          {
            startedAt: inside,
            agentType: 'x',
            description: 'd',
            model: null,
            isFinished: true,
            toolCalls: 1,
            outputTokens: 1,
          },
          {
            startedAt: null,
            agentType: 'y',
            description: 'd',
            model: null,
            isFinished: true,
            toolCalls: 1,
            outputTokens: 1,
          },
        ],
        apiErrors: [
          { at: inside, status: 529, text: 'a' },
          { at: outside, status: 529, text: 'b' },
        ],
      },
    )
    const january: ReportRange = { kind: 'custom', from: '2026-01-01', to: '2026-01-31' }

    const cut = agentInRange([stats], WEEK)

    expect(cut?.skills.map((skill) => skill.skill)).toEqual(['plan'])
    expect(cut?.compacts.map((compact) => compact.at)).toEqual([inside])
    expect(cut?.subagents.map((subagent) => subagent.agentType)).toEqual(['x'])
    expect(cut?.apiErrors.map((error) => error.text)).toEqual(['a'])
    expect(cut?.tools['Read']?.calls).toBe(2)
    expect(agentInRange([stats], january)).toBeNull()
  })
})

describe('buildReport', () => {
  it('lists a ticket with hours, commits or tokens and skips an idle one', () => {
    const report = buildReport(
      input({
        hrmTasks: [
          task('2026-11-03', 'MDP-1', 'One', 3600),
          task('2026-11-04', 'mdp-1', 'One', 1800),
          task('2026-11-20', 'MDP-9', 'Out of range', 3600),
          task('2026-11-03', 'MDP-IDLE', 'Idle', 0),
        ],
        commits: { 'MDP-2': commits(2) },
        agent: { 'MDP-3': oneDay('2026-11-03', 5), 'MDP-4': oneDay('2026-11-20', 5) },
      }),
    )

    expect(report.rows.map((row) => row.ticketKey)).toEqual(['MDP-1', 'MDP-3', 'MDP-2'])
    expect(report.rows[0]?.hours).toBe(1.5)
    expect(report.hoursRead).toBe(true)
    expect(report.rows[2]?.hours).toBe(0)
    expect(totalTokens(report.rows[1]?.tokens ?? day(0))).toBe(5)
    expect(report.rows[1]?.sessions).toBe(1)
  })

  it('keeps hours null when HRM was not read', () => {
    const report = buildReport(input({ commits: { 'MDP-2': commits(2) } }))

    expect(report.hoursRead).toBe(false)
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]?.hours).toBeNull()
    expect(report.hoursByDay).toEqual({})
  })

  it('sorts by hours then tokens and fills every day', () => {
    const report = buildReport(
      input({
        hrmTasks: [task('2026-11-03', 'B-1', null, 7200), task('2026-11-04', 'A-1', null, 3600)],
        agent: {
          'A-1': oneDay('2026-11-04', 10),
          'C-1': oneDay('2026-11-03', 500),
          'D-1': oneDay('2026-11-03', 20),
        },
        commits: { 'A-1': commits(3) },
      }),
    )

    expect(report.rows.map((row) => row.ticketKey)).toEqual(['B-1', 'A-1', 'C-1', 'D-1'])
    expect(Object.keys(report.tokensByDay)).toHaveLength(7)
    expect(report.hoursByDay['2026-11-03']).toBe(2)
    expect(report.hoursByDay['2026-11-04']).toBe(1)
    expect(report.hoursByDay['2026-11-05']).toBe(0)
    expect(report.tokensByDay['2026-11-03']).toBe(520)
    expect(report.tokensByDay['2026-11-04']).toBe(10)
    expect(report.tokensByDay['2026-11-05']).toBe(0)
  })

  it('takes the summary from HRM for a ticket off the board', () => {
    const facts: Record<string, TicketReportFacts> = {
      'ON-1': { summary: 'From board', status: 'In Progress', section: 'started' },
    }
    const report = buildReport(
      input({
        hrmTasks: [
          task('2026-11-03', 'OFF-1', 'From HRM', 3600),
          task('2026-11-03', 'ON-1', 'From HRM', 3600),
        ],
        facts,
      }),
    )

    const off = report.rows.find((row) => row.ticketKey === 'OFF-1')
    const on = report.rows.find((row) => row.ticketKey === 'ON-1')
    expect(off?.facts).toEqual({ summary: 'From HRM', status: null, section: null })
    expect(on?.facts).toEqual(facts['ON-1'])
  })
})
