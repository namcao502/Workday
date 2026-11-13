import { describe, expect, it } from 'vitest'
import { reportCsv, reportMarkdown } from './reportExport.js'
import type { TicketReport } from './ticketReports.js'

const NO_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  turns: 0,
  turnSeconds: 0,
}

function report(): TicketReport {
  return {
    range: { kind: 'thisWeek', from: '2026-11-02', to: '2026-11-08' },
    hoursRead: false,
    hoursByDay: {},
    tokensByDay: {},
    rows: [
      {
        ticketKey: 'MDP-1',
        facts: { summary: 'Fix, "quoted"\nline | pipe', status: 'Done', section: null },
        hours: 1.5,
        sessions: 2,
        turns: 3,
        claudeSeconds: 5400,
        tokens: { ...NO_USAGE, inputTokens: 1_000_000, outputTokens: 200_000, turns: 3 },
        commits: { commits: 2, files: 4, added: 120, deleted: 30 },
        agent: null,
      },
      {
        ticketKey: 'MDP-2',
        facts: { summary: null, status: null, section: null },
        hours: null,
        sessions: 0,
        turns: 0,
        claudeSeconds: 0,
        tokens: NO_USAGE,
        commits: null,
        agent: null,
      },
    ],
  }
}

describe('reportCsv', () => {
  it('escapes quotes, commas and line breaks and ends with the total', () => {
    const csv = reportCsv(report())

    expect(
      csv.startsWith('Ticket,Summary,Status,Section,Hours,Sessions,Turns,Claude minutes,Tokens,'),
    ).toBe(true)
    expect(csv).toContain('Commits,Files changed,Lines added,Lines deleted\r\n')
    expect(csv).toContain(
      'MDP-1,"Fix, ""quoted""\nline | pipe",Done,,1.50,2,3,90,1200000,1000000,200000,0,0,2,4,120,30\r\n',
    )
    expect(csv).toContain('\r\nMDP-2,,,,,0,0,0,0,0,0,0,0,0,0,0,0\r\n')
    expect(csv.endsWith('\r\nTotal,,,,1.50,2,3,90,1200000,1000000,200000,0,0,2,4,120,30\r\n')).toBe(
      true,
    )
  })
})

describe('reportMarkdown', () => {
  it('escapes pipes and shortens tokens', () => {
    const markdown = reportMarkdown(report())
    const lines = markdown.split('\n').filter((line) => line !== '')

    expect(lines[0]).toBe('**Report 2026-11-02 - 2026-11-08**')
    expect(markdown).toContain(
      '| Ticket | Summary | Status | Hours | Tokens | Commits | Files | Lines |',
    )
    expect(markdown).toContain(
      '| MDP-1 | Fix, "quoted" line \\| pipe | Done | 1.50 | 1.2M | 2 | 4 | +120/-30 |',
    )
    expect(markdown).toContain('| MDP-2 |  |  | - | 0 | 0 | 0 | +0/-0 |')
    expect(lines[lines.length - 1]?.startsWith('| Total |')).toBe(true)
  })
})
