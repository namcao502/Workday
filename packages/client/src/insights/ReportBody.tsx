import { ChartColumn } from '@gravity-ui/icons'
import { Card } from '@heroui/react'
import { totalTokens, type TicketReport } from '@workday/core'
import { useState } from 'react'
import { t } from '../i18n.js'
import { EmptyState } from '../ui/EmptyState.js'
import { DayChart, type DayValue } from './DayChart.js'
import { EMPTY_CELL, formatHours, formatTokens } from './insightsText.js'
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
    { label: t('insights.tickets'), value: String(rows.length) },
    { label: t('insights.hours'), value: hours },
    { label: 'TOKENS', value: formatTokens(sumOf(rows.map((row) => totalTokens(row.tokens)))) },
    { label: 'COMMITS', value: String(sumOf(rows.map((row) => row.commits?.commits ?? 0))) },
    {
      label: t('insights.files'),
      value: String(sumOf(rows.map((row) => row.commits?.files ?? 0))),
    },
  ]
}

// Every day that has hours or tokens, in order; hours stay null when HRM was not read.
function dayValues(report: TicketReport): readonly DayValue[] {
  const days = [...new Set([...Object.keys(report.hoursByDay), ...Object.keys(report.tokensByDay)])]
  return days.sort().map((day) => ({
    day,
    hours: report.hoursRead ? (report.hoursByDay[day] ?? 0) : null,
    tokens: report.tokensByDay[day] ?? 0,
  }))
}

export function ReportBody({ report, urlFor }: ReportBodyProps): React.JSX.Element {
  // undefined = nothing picked yet: the first ticket's detail shows; null = the user closed it.
  const [pickedKey, setPickedKey] = useState<string | null | undefined>(undefined)
  if (report.rows.length === 0) {
    return (
      <EmptyState
        icon={<ChartColumn aria-hidden="true" />}
        message={t('insights.noWorkInThisRangePick')}
      />
    )
  }
  // A pick that is not in this range (another range was read) falls back to the first ticket too.
  const picked =
    pickedKey === undefined
      ? undefined
      : pickedKey === null
        ? null
        : report.rows.find((row) => row.ticketKey === pickedKey)
  const selected = picked === undefined ? (report.rows[0] ?? null) : picked
  const selectedKey = selected?.ticketKey ?? null
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">
        {totals(report).map((fact) => (
          <Card key={fact.label} className="gap-0 px-4 py-3">
            <span className="text-xs font-medium text-muted">{fact.label}</span>
            <span className="text-2xl font-semibold tabular-nums">{fact.value}</span>
          </Card>
        ))}
      </div>
      <DayChart days={dayValues(report)} />
      {report.hoursRead ? null : (
        <p className="text-sm text-muted">{t('insights.hrmHoursCouldNotBeRead')}</p>
      )}
      <ReportTable
        report={report}
        selectedKey={selectedKey}
        urlFor={urlFor}
        onSelect={(key) => {
          setPickedKey(key === selectedKey ? null : key)
        }}
      />
      {selected === null ? null : (
        <Card aria-label={selected.ticketKey}>
          <Card.Header>
            <Card.Title className="text-base font-semibold" render={(props) => <h2 {...props} />}>
              {selected.ticketKey}
            </Card.Title>
          </Card.Header>
          <Card.Content>
            <ReportDetail row={selected} />
          </Card.Content>
        </Card>
      )}
    </div>
  )
}
