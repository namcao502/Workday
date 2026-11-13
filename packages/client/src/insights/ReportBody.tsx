import { totalTokens, type TicketReport } from '@workday/core'
import { useState } from 'react'
import { t } from '../i18n.js'
import { BarChart, type Bar } from './BarChart.js'
import { dayLabel, EMPTY_CELL, formatHours, formatTokens } from './insightsText.js'
import { ReportDetail } from './ReportDetail.js'
import { ReportTable } from './ReportTable.js'

interface ReportBodyProps {
  readonly report: TicketReport
  readonly urlFor: (key: string) => string | null
}

interface Fact {
  readonly label: string
  readonly value: string
}

function sumOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function totals(report: TicketReport): readonly Fact[] {
  const rows = report.rows
  const hours = report.hoursRead
    ? formatHours(sumOf(rows.map((row) => row.hours ?? 0)))
    : EMPTY_CELL
  return [
    { label: t('TICKETS', 'TICKET'), value: String(rows.length) },
    { label: t('HOURS', 'GIỜ'), value: hours },
    { label: 'TOKENS', value: formatTokens(sumOf(rows.map((row) => totalTokens(row.tokens)))) },
    { label: 'COMMITS', value: String(sumOf(rows.map((row) => row.commits?.commits ?? 0))) },
    { label: t('FILES', 'FILE'), value: String(sumOf(rows.map((row) => row.commits?.files ?? 0))) },
  ]
}

function dayBars(byDay: Readonly<Record<string, number>>): readonly Bar[] {
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({ label: dayLabel(day), value }))
}

function Charts({ report }: { readonly report: TicketReport }): React.JSX.Element {
  const hoursBars = report.rows.map((row) => ({ label: row.ticketKey, value: row.hours ?? 0 }))
  const tokenBars = report.rows.map((row) => ({
    label: row.ticketKey,
    value: totalTokens(row.tokens),
  }))
  return (
    <div className="report-charts">
      {report.hoursRead ? (
        <BarChart
          title={t('Hours by ticket', 'Giờ theo ticket')}
          bars={hoursBars}
          formatValue={formatHours}
        />
      ) : null}
      <BarChart
        title={t('Tokens by ticket', 'Token theo ticket')}
        bars={tokenBars}
        formatValue={formatTokens}
      />
      {report.hoursRead ? (
        <BarChart
          title={t('Hours by day', 'Giờ theo ngày')}
          bars={dayBars(report.hoursByDay)}
          formatValue={formatHours}
          horizontal={false}
        />
      ) : null}
      <BarChart
        title={t('Tokens by day', 'Token theo ngày')}
        bars={dayBars(report.tokensByDay)}
        formatValue={formatTokens}
        horizontal={false}
      />
    </div>
  )
}

export function ReportBody({ report, urlFor }: ReportBodyProps): React.JSX.Element {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  if (report.rows.length === 0) {
    return (
      <p className="muted report-empty">
        {t(
          'No work in this range - pick another range',
          'Không có việc trong khoảng này - chọn khoảng khác',
        )}
      </p>
    )
  }
  const selected = report.rows.find((row) => row.ticketKey === selectedKey) ?? null
  return (
    <div className="report-body">
      <div className="report-totals">
        {totals(report).map((fact) => (
          <div key={fact.label} className="report-fact">
            <span className="section-label">{fact.label}</span>
            <span className="report-fact-value">{fact.value}</span>
          </div>
        ))}
      </div>
      <Charts report={report} />
      {report.hoursRead ? null : (
        <p className="muted">
          {t('HRM hours could not be read (see log)', 'Không đọc được giờ HRM (xem log)')}
        </p>
      )}
      <div className="report-table-wrap">
        <ReportTable
          report={report}
          selectedKey={selectedKey}
          urlFor={urlFor}
          onSelect={setSelectedKey}
        />
      </div>
      {selected === null ? null : (
        <section className="report-detail-block" aria-label={selected.ticketKey}>
          <h2 className="section-label">{selected.ticketKey}</h2>
          <ReportDetail row={selected} />
        </section>
      )}
    </div>
  )
}
