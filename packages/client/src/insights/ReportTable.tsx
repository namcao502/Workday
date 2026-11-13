import { totalTokens, type TicketReport, type TicketReportRow } from '@workday/core'
import { KeyPill } from '../board/KeyPill.js'
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
    t('TICKET', 'TICKET'),
    t('SUMMARY', 'TÓM TẮT'),
    t('STATUS', 'TRẠNG THÁI'),
    t('HOURS', 'GIỜ'),
    t('SESSIONS', 'PHIÊN'),
    t('TURNS', 'LƯỢT'),
    t('CLAUDE TIME', 'THỜI GIAN CLAUDE'),
    'TOKENS',
    'COMMITS',
    t('FILES', 'FILE'),
    t('LINES', 'DÒNG'),
  ]
}

export function ReportTable({
  report,
  selectedKey,
  urlFor,
  onSelect,
}: ReportTableProps): React.JSX.Element {
  return (
    <table className="report-table">
      <thead>
        <tr>
          {headers().map((header) => (
            <th key={header} scope="col">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {report.rows.map((row) => {
          const url = urlFor(row.ticketKey)
          return (
            <tr
              key={row.ticketKey}
              className="report-row"
              aria-selected={row.ticketKey === selectedKey}
              tabIndex={0}
              onClick={() => {
                onSelect(row.ticketKey)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onSelect(row.ticketKey)
                }
              }}
            >
              <td>
                {url === null ? row.ticketKey : <KeyPill ticketKey={row.ticketKey} url={url} />}
              </td>
              <td className="report-summary">{row.facts.summary ?? EMPTY_CELL}</td>
              <td>{row.facts.status ?? EMPTY_CELL}</td>
              <td className="num">{hoursCell(row, report.hoursRead)}</td>
              <td className="num">{numberCell(row.sessions)}</td>
              <td className="num">{numberCell(row.turns)}</td>
              <td className="num">{formatClaudeTime(row.claudeSeconds)}</td>
              <td className="num">{formatTokens(totalTokens(row.tokens))}</td>
              <td className="num">{numberCell(row.commits?.commits ?? 0)}</td>
              <td className="num">{numberCell(row.commits?.files ?? 0)}</td>
              <td className="num">{linesCell(row)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
