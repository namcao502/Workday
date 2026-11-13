import { addDayUsage, EMPTY_DAY_USAGE } from './agentStats.js'
import { totalTokens, type TicketReport, type TicketReportRow } from './ticketReports.js'

const TOTAL_KEY = 'Total'
const CSV_LINE_BREAK = '\r\n'
const SECONDS_PER_MINUTE = 60
const THOUSAND = 1000
const MILLION = 1_000_000

const CSV_HEADER = [
  'Ticket',
  'Summary',
  'Status',
  'Section',
  'Hours',
  'Sessions',
  'Turns',
  'Claude minutes',
  'Tokens',
  'Input tokens',
  'Output tokens',
  'Cache read tokens',
  'Cache write tokens',
  'Commits',
  'Files changed',
  'Lines added',
  'Lines deleted',
]

// One decimal with a trailing .0 dropped; dots, never locale separators.
function oneDecimal(value: number): string {
  return String(Math.round(value * 10) / 10)
}

// 950, 12.3k, 1.2M.
function tokenText(tokens: number): string {
  if (tokens < THOUSAND) {
    return String(tokens)
  }
  if (tokens < MILLION) {
    return `${oneDecimal(tokens / THOUSAND)}k`
  }
  return `${oneDecimal(tokens / MILLION)}M`
}

function hoursText(hours: number | null, whenUnknown: string): string {
  return hours === null ? whenUnknown : hours.toFixed(2)
}

function csvCell(value: string): string {
  return /[,"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function totalRow(report: TicketReport): TicketReportRow {
  const rows = report.rows
  const known = rows.flatMap((row) => (row.hours === null ? [] : [row.hours]))
  return {
    ticketKey: TOTAL_KEY,
    facts: { summary: null, status: null, section: null },
    hours: known.length === 0 ? null : sum(known),
    sessions: sum(rows.map((row) => row.sessions)),
    turns: sum(rows.map((row) => row.turns)),
    claudeSeconds: sum(rows.map((row) => row.claudeSeconds)),
    tokens: rows.reduce((total, row) => addDayUsage(total, row.tokens), EMPTY_DAY_USAGE),
    commits: {
      commits: sum(rows.map((row) => row.commits?.commits ?? 0)),
      files: sum(rows.map((row) => row.commits?.files ?? 0)),
      added: sum(rows.map((row) => row.commits?.added ?? 0)),
      deleted: sum(rows.map((row) => row.commits?.deleted ?? 0)),
    },
    agent: null,
  }
}

// RFC 4180 without the BOM (the client adds it); the last row is the total.
export function reportCsv(report: TicketReport): string {
  const lines = [CSV_HEADER.join(',')]
  for (const row of [...report.rows, totalRow(report)]) {
    const cells = [
      row.ticketKey,
      row.facts.summary ?? '',
      row.facts.status ?? '',
      row.facts.section ?? '',
      hoursText(row.hours, ''),
      String(row.sessions),
      String(row.turns),
      String(Math.round(row.claudeSeconds / SECONDS_PER_MINUTE)),
      String(totalTokens(row.tokens)),
      String(row.tokens.inputTokens),
      String(row.tokens.outputTokens),
      String(row.tokens.cacheReadTokens),
      String(row.tokens.cacheWriteTokens),
      String(row.commits?.commits ?? 0),
      String(row.commits?.files ?? 0),
      String(row.commits?.added ?? 0),
      String(row.commits?.deleted ?? 0),
    ]
    lines.push(cells.map(csvCell).join(','))
  }
  return lines.join(CSV_LINE_BREAK) + CSV_LINE_BREAK
}

export function reportMarkdown(report: TicketReport): string {
  const lines = [
    `**Report ${report.range.from} - ${report.range.to}**`,
    '',
    '| Ticket | Summary | Status | Hours | Tokens | Commits | Files | Lines |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const row of [...report.rows, totalRow(report)]) {
    const summary = (row.facts.summary ?? '')
      .replaceAll('\r', '')
      .replaceAll('\n', ' ')
      .replaceAll('|', '\\|')
    const cells = [
      row.ticketKey,
      summary,
      (row.facts.status ?? '').replaceAll('|', '\\|'),
      hoursText(row.hours, '-'),
      tokenText(totalTokens(row.tokens)),
      String(row.commits?.commits ?? 0),
      String(row.commits?.files ?? 0),
      '+' + String(row.commits?.added ?? 0) + '/-' + String(row.commits?.deleted ?? 0),
    ]
    lines.push(`| ${cells.join(' | ')} |`)
  }
  return lines.join('\n') + '\n'
}
