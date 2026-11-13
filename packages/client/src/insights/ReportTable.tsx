import { Card } from '@heroui/react'
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
  const th = 'whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted'
  const td = 'border-t border-separator px-3 py-2 align-top'
  const num = `${td} whitespace-nowrap text-right`
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead>
          <tr>
            {headers().map((header) => (
              <th key={header} scope="col" className={th}>
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
                className="cursor-pointer hover:bg-surface-secondary aria-selected:bg-surface-secondary"
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
                <td className={td}>
                  {url === null ? row.ticketKey : <KeyPill ticketKey={row.ticketKey} url={url} />}
                </td>
                <td className={`${td} max-w-xs`}>{row.facts.summary ?? EMPTY_CELL}</td>
                <td className={td}>{row.facts.status ?? EMPTY_CELL}</td>
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
