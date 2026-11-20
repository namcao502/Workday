import { Card } from '@heroui/react'
import { totalTokens, type TicketReport, type TicketReportRow } from '@workday/core'
import { KeyPill } from '../board/KeyPill.js'
import { StatusText } from '../board/StatusText.js'
import { t } from '../i18n.js'
import { EMPTY_CELL, formatClaudeTime, formatHours, formatTokens } from './insightsText.js'

interface ReportTableProps {
  readonly report: TicketReport
  readonly selectedKey: string | null
  readonly urlFor: (key: string) => string | null
  readonly onSelect: (key: string) => void
}

function numberCell(value: number): string {
  return value === 0 ? EMPTY_CELL : String(value)
}

function hoursCell(row: TicketReportRow, hoursRead: boolean): string {
  return hoursRead && row.hours !== null ? formatHours(row.hours) : EMPTY_CELL
}

function linesCell(row: TicketReportRow): string {
  const commits = row.commits
  return commits === null || commits.commits === 0
    ? EMPTY_CELL
    : `+${String(commits.added)} -${String(commits.deleted)}`
}

function headers(): readonly string[] {
  return [
    t('insights.ticket'),
    t('insights.summary'),
    t('insights.status'),
    t('insights.hours'),
    t('insights.sessions'),
    t('insights.turns'),
    t('insights.claudeTime'),
    'TOKENS',
    'COMMITS',
    t('insights.files'),
    t('insights.lines'),
  ]
}

// The key and status columns hold pills or short labels, so they are centered.
const CENTERED_COLUMNS: ReadonlySet<number> = new Set([0, 2])

export function ReportTable({
  report,
  selectedKey,
  urlFor,
  onSelect,
}: ReportTableProps): React.JSX.Element {
  const th = 'whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted'
  const td = 'px-3 py-2 align-top'
  const num = `${td} whitespace-nowrap text-right`
  const centered = `${td} text-center`
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr>
            {headers().map((header, index) => (
              <th
                key={header}
                scope="col"
                className={
                  CENTERED_COLUMNS.has(index) ? th.replace('text-left', 'text-center') : th
                }
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => {
            const url = urlFor(row.ticketKey)
            return (
              <tr key={row.ticketKey} data-selected={row.ticketKey === selectedKey}>
                <td className={centered}>
                  {url === null ? row.ticketKey : <KeyPill ticketKey={row.ticketKey} url={url} />}
                </td>
                <td className={`${td} max-w-xs`}>
                  <button
                    type="button"
                    className="w-full cursor-pointer text-left"
                    aria-pressed={row.ticketKey === selectedKey}
                    onClick={() => {
                      onSelect(row.ticketKey)
                    }}
                  >
                    {row.facts.summary ?? EMPTY_CELL}
                  </button>
                </td>
                <td className={centered}>
                  {row.facts.status === null ? (
                    EMPTY_CELL
                  ) : (
                    <StatusText
                      status={row.facts.status}
                      statusCategory={row.facts.statusCategory}
                    />
                  )}
                </td>
                <td className={num}>{hoursCell(row, report.hoursRead)}</td>
                <td className={num}>{numberCell(row.sessions)}</td>
                <td className={num}>{numberCell(row.turns)}</td>
                <td className={num}>{formatClaudeTime(row.claudeSeconds)}</td>
                <td className={num}>{formatTokens(totalTokens(row.tokens))}</td>
                <td className={num}>{numberCell(row.commits?.commits ?? 0)}</td>
                <td className={num}>{numberCell(row.commits?.files ?? 0)}</td>
                <td className={num}>{linesCell(row)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
