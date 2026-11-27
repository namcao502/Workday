import { DEFAULT_REPORT_TIME_ZONE, type AgentStats, type TicketReportRow } from '@workday/core'
import { useSettings } from '../api/useSettings.js'
import { formatShortDate, getLanguage, t } from '../i18n.js'
import { EMPTY_CELL, formatTokens } from './insightsText.js'

interface StatsTableProps {
  readonly title: string
  readonly headers: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

const MS_PER_SECOND = 1000

function timeText(iso: string | null, timeZone: string): string {
  return iso === null ? EMPTY_CELL : formatShortDate(new Date(iso), getLanguage(), timeZone)
}

function StatsTable({ title, headers, rows }: StatsTableProps): React.JSX.Element {
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium text-muted">{`${title} (${String(rows.length)})`}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{EMPTY_CELL}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {headers.map((header) => (
                  <th
                    key={header}
                    scope="col"
                    className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((cells, index) => (
                <tr key={`${String(index)}-${cells.join('|')}`}>
                  {cells.map((cell, cellIndex) => (
                    // The first column is a time or a name: one line, the rest wraps.
                    <td
                      key={headers[cellIndex]}
                      className={`px-3 py-2 align-top ${cellIndex === 0 ? 'whitespace-nowrap' : ''}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  const timeZone = useSettings().data?.config.timeZone ?? DEFAULT_REPORT_TIME_ZONE
  const stats = row.agent
  if (stats === null) {
    return <p className="text-sm text-muted">{t('insights.noClaudeActivityInThisRange')}</p>
  }
  const time = t('insights.time')
  const status = t('insights.status')
  return (
    <div className="flex flex-col gap-4">
      <StatsTable
        title="Skills"
        headers={[time, 'SKILL', t('insights.args')]}
        rows={stats.skills.map((skill) => [
          timeText(skill.at, timeZone),
          skill.skill,
          skill.args ?? '',
        ])}
      />
      <StatsTable
        title="Tools"
        headers={['TOOL', t('insights.calls'), t('insights.errors')]}
        rows={toolRows(stats)}
      />
      <StatsTable
        title="Subagents"
        headers={[
          t('insights.started'),
          t('insights.type'),
          t('insights.description'),
          'MODEL',
          'TOOLS',
          'OUTPUT',
          status,
        ]}
        rows={stats.subagents.map((sub) => [
          timeText(sub.startedAt, timeZone),
          sub.agentType,
          sub.description,
          sub.model ?? EMPTY_CELL,
          String(sub.toolCalls),
          formatTokens(sub.outputTokens),
          sub.isFinished ? t('insights.done') : t('insights.running'),
        ])}
      />
      <StatsTable
        title="Compacts"
        headers={[time, t('insights.type'), t('insights.beforeAfter'), t('insights.duration')]}
        rows={stats.compacts.map((compact) => [
          timeText(compact.at, timeZone),
          compact.isAuto ? 'auto' : 'manual',
          `${formatTokens(compact.preTokens)} → ${formatTokens(compact.postTokens)}`,
          `${String(Math.round(compact.durationMs / MS_PER_SECOND))}s`,
        ])}
      />
      <StatsTable
        title={t('insights.apiErrors')}
        headers={[time, status, t('insights.message')]}
        rows={stats.apiErrors.map((error) => [
          timeText(error.at, timeZone),
          error.status === null ? EMPTY_CELL : String(error.status),
          error.text,
        ])}
      />
    </div>
  )
}
