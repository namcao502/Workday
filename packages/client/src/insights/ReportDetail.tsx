import { DEFAULT_REPORT_TIME_ZONE, type AgentStats, type TicketReportRow } from '@workday/core'
import { formatShortDate, getLanguage, t } from '../i18n.js'
import { EMPTY_CELL, formatTokens } from './insightsText.js'

interface StatsTableProps {
  readonly title: string
  readonly headers: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

const MS_PER_SECOND = 1000

function timeText(iso: string | null): string {
  return iso === null
    ? EMPTY_CELL
    : formatShortDate(new Date(iso), getLanguage(), DEFAULT_REPORT_TIME_ZONE)
}

function StatsTable({ title, headers, rows }: StatsTableProps): React.JSX.Element {
  return (
    <section className="stats-table">
      <h3 className="section-label">{`${title} (${String(rows.length)})`}</h3>
      {rows.length === 0 ? (
        <p className="muted">{EMPTY_CELL}</p>
      ) : (
        <table className="report-table">
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, index) => (
              <tr key={`${String(index)}-${cells.join('|')}`}>
                {cells.map((cell, cellIndex) => (
                  <td key={headers[cellIndex]}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function toolRows(stats: AgentStats): readonly (readonly string[])[] {
  return Object.entries(stats.tools)
    .sort(([nameA, a], [nameB, b]) => b.calls - a.calls || nameA.localeCompare(nameB))
    .map(([name, usage]) => [
      name,
      String(usage.calls),
      usage.errors === 0 ? EMPTY_CELL : String(usage.errors),
    ])
}

export function ReportDetail({ row }: { readonly row: TicketReportRow }): React.JSX.Element {
  const stats = row.agent
  if (stats === null) {
    return (
      <p className="muted">
        {t('No Claude activity in this range', 'Không có hoạt động Claude trong khoảng này')}
      </p>
    )
  }
  const time = t('TIME', 'THỜI GIAN')
  const status = t('STATUS', 'TRẠNG THÁI')
  return (
    <div className="report-detail">
      <StatsTable
        title="Skills"
        headers={[time, 'SKILL', t('ARGS', 'THAM SỐ')]}
        rows={stats.skills.map((skill) => [timeText(skill.at), skill.skill, skill.args ?? ''])}
      />
      <StatsTable
        title="Tools"
        headers={['TOOL', t('CALLS', 'LƯỢT GỌI'), t('ERRORS', 'LỖI')]}
        rows={toolRows(stats)}
      />
      <StatsTable
        title="Subagents"
        headers={[
          t('STARTED', 'BẮT ĐẦU'),
          t('TYPE', 'LOẠI'),
          t('DESCRIPTION', 'MÔ TẢ'),
          'MODEL',
          'TOOLS',
          'OUTPUT',
          status,
        ]}
        rows={stats.subagents.map((sub) => [
          timeText(sub.startedAt),
          sub.agentType,
          sub.description,
          sub.model ?? EMPTY_CELL,
          String(sub.toolCalls),
          formatTokens(sub.outputTokens),
          sub.isFinished ? t('done', 'xong') : t('running', 'đang chạy'),
        ])}
      />
      <StatsTable
        title="Compacts"
        headers={[
          time,
          t('TYPE', 'LOẠI'),
          t('BEFORE → AFTER', 'TRƯỚC → SAU'),
          t('DURATION', 'THỜI LƯỢNG'),
        ]}
        rows={stats.compacts.map((compact) => [
          timeText(compact.at),
          compact.isAuto ? 'auto' : 'manual',
          `${formatTokens(compact.preTokens)} → ${formatTokens(compact.postTokens)}`,
          `${String(Math.round(compact.durationMs / MS_PER_SECOND))}s`,
        ])}
      />
      <StatsTable
        title={t('API errors', 'Lỗi API')}
        headers={[time, status, t('MESSAGE', 'NỘI DUNG')]}
        rows={stats.apiErrors.map((error) => [
          timeText(error.at),
          error.status === null ? EMPTY_CELL : String(error.status),
          error.text,
        ])}
      />
    </div>
  )
}
