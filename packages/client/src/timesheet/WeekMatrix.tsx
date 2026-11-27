import { Card } from '@heroui/react'
import type { DayCoverage, LogDayView } from '@workday/core'
import { t, type Language } from '../i18n.js'
import { Tip } from '../ui/Tip.js'
import { clockText, dayHeader } from './timesheetText.js'
import {
  hrmCell,
  hrmTotal,
  missingDays,
  todayNeeds,
  tscCell,
  tscTotal,
  type CellTone,
  type MatrixCell,
} from './weekCells.js'

interface WeekMatrixProps {
  readonly days: readonly LogDayView[]
  readonly coverage: readonly DayCoverage[] | null
  readonly today: string
  readonly selected: string
  readonly language: Language
  readonly logTime: string
  readonly onSelect: (date: string) => void
}

const TONE: Record<CellTone, string> = {
  ok: 'bg-success/15 text-success',
  miss: 'bg-danger/15 text-danger',
  wait: 'border border-dashed border-default-foreground/25 text-muted',
  off: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(139_92_246/0.08)_6px_12px)]',
  none: 'text-muted',
}

function Cell({
  cell,
  today,
  onPress,
}: {
  readonly cell: MatrixCell
  readonly today: boolean
  readonly onPress: () => void
}): React.JSX.Element {
  return (
    <td className="p-0.5">
      <button
        type="button"
        className={`press-flat flex h-10 w-full cursor-pointer items-center justify-center rounded-lg px-2 text-sm font-medium ${TONE[cell.tone]}${today ? ' font-semibold' : ''}`}
        onClick={onPress}
      >
        <span className="@xl:hidden">{cell.short}</span>
        <Tip whenTruncated className="hidden min-w-0 truncate @xl:block" content={cell.text}>
          {cell.text}
        </Tip>
      </button>
    </td>
  )
}

// HRM and TSC for each day of the week at a glance: green done, red a past day still short, violet off.
export function WeekMatrix(props: WeekMatrixProps): React.JSX.Element | null {
  const { days, coverage, today, language } = props
  if (coverage === null) {
    return null
  }
  const hrm = hrmTotal(coverage, today)
  const tsc = tscTotal(coverage, today)
  const missing = missingDays(days, today, (date) => dayHeader(date, language))
  const needs = todayNeeds(days, today)
  const rows: readonly {
    label: string
    cell: (day: LogDayView) => MatrixCell
    total: React.ReactNode
  }[] = [
    {
      label: 'HRM',
      cell: (day) => hrmCell(day, today),
      total: (
        <>
          {`${String(hrm.hours)}h`}
          <span className="text-xs font-normal text-muted @xl:text-sm">{` / ${String(hrm.target)}h`}</span>
        </>
      ),
    },
    {
      label: 'TSC',
      cell: (day) => tscCell(day, today),
      total: (
        <>
          {String(tsc.done)}
          <span className="text-xs font-normal text-muted @xl:text-sm">{` / ${String(tsc.of)}`}</span>
        </>
      ),
    },
  ]
  return (
    <Card className="@container gap-2">
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">{t('timesheet.matrixCaption')}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-10 @xl:w-12" />
            {days.map((day) => (
              <th
                key={day.date}
                scope="col"
                className={`pb-1 text-xs font-medium ${day.date === props.selected ? 'text-accent' : 'text-muted'}`}
              >
                {dayHeader(day.date, language)}
              </th>
            ))}
            <th scope="col" className="w-16 pb-1 text-xs font-medium text-muted @xl:w-24">
              {t('timesheet.weekColumn')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="text-left text-sm font-semibold">
                {row.label}
              </th>
              {days.map((day) => (
                <Cell
                  key={day.date}
                  cell={row.cell(day)}
                  today={day.date === today}
                  onPress={() => {
                    props.onSelect(day.date)
                  }}
                />
              ))}
              <td className="text-center text-base font-semibold whitespace-nowrap tabular-nums @xl:text-lg">
                {row.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {missing.length === 0 ? null : (
        <p className="text-sm text-danger">
          {t('timesheet.stillMissing', { days: missing.join(', ') })}
        </p>
      )}
      {needs === null ? null : (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm">
          {t('timesheet.todayNeeds', { what: needs, time: clockText(props.logTime) })}
        </p>
      )}
    </Card>
  )
}
