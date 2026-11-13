import { Button, Card, Chip } from '@heroui/react'
import {
  entryMinutes,
  isHrmClosed,
  minutesUntilRun,
  minutesWith,
  queueDayState,
  type HrmTask,
  type LogDayView,
  type WeekReviewItem,
  type ZonedClock,
} from '@workday/core'
import { useAccess } from '../api/useMe.js'
import { t, type Language } from '../i18n.js'
import { HoursBar } from './HoursBar.js'
import { TicketRows } from './TicketRows.js'
import { dayHeader, DONE_MARK, formatMinutes, issueText, queueStatusText } from './timesheetText.js'

const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60

export interface DayCardProps {
  readonly day: LogDayView
  readonly clock: ZonedClock
  readonly language: Language
  readonly logTime: string
  readonly logTimeMinutes: number
  readonly selected: boolean
  readonly canLog: boolean
  readonly working: boolean
  readonly hrmTasks: readonly HrmTask[]
  readonly review: readonly WeekReviewItem[]
  readonly urlFor: (key: string) => string
  readonly onSelect: (date: string) => void
  readonly onLogNow: (date: string) => void
  readonly onSaveMinutes: (
    date: string,
    tickets: readonly string[],
    minutes: readonly number[],
  ) => void
  readonly onRemove: (date: string, key: string) => void
  readonly onRejected: () => void
}

function stateLabel(props: DayCardProps): string {
  const { day } = props
  switch (day.state) {
    case 'off':
      return t('Day off', 'Nghỉ')
    case 'logged':
      return `${DONE_MARK} ${formatMinutes(Math.round((day.coverage?.hrmHours ?? 0) * MINUTES_PER_HOUR))}`
    case 'queued':
      return t('Queued', 'Trong hàng đợi')
    case 'future':
      return t('not yet', 'chưa tới')
    case 'empty':
      return ''
  }
}

function tscLine(day: LogDayView): string {
  const coverage = day.coverage
  if (coverage === null) {
    return ''
  }
  if (coverage.tscState === 'read') {
    const text = (coverage.tscText ?? '').trim()
    return text === '' ? 'TSC -' : `TSC ${DONE_MARK} ${text}`
  }
  return coverage.tscState === 'failed'
    ? t('TSC not read', 'Chưa đọc được TSC')
    : t('TSC not read yet', 'TSC chưa đọc')
}

function LoggedBody({ props }: { readonly props: DayCardProps }): React.JSX.Element {
  const { day, hrmTasks, review } = props
  const tasks = hrmTasks.filter((task) => task.date === day.date && task.workingSeconds > 0)
  const items = review.filter((item) => item.date === day.date)
  const tooltip = items.map((item) => `${item.ticketKey}: ${issueText(item)}`).join('\n')
  return (
    <>
      {tasks.length === 0 ? null : (
        <HoursBar
          minutes={tasks.map((task) => Math.round(task.workingSeconds / SECONDS_PER_MINUTE))}
          labels={tasks.map((task) => task.ticketKey)}
        />
      )}
      <p className="text-sm">{tscLine(day)}</p>
      {items.length === 0 ? null : (
        <p className="text-sm text-warning" title={tooltip}>
          {t(
            `${String(items.length)} ticket(s) to check`,
            `${String(items.length)} ticket cần xem`,
          )}
        </p>
      )}
    </>
  )
}

function QueuedBody({ props }: { readonly props: DayCardProps }): React.JSX.Element | null {
  const { day, clock, logTime, logTimeMinutes, language } = props
  const entry = day.queued
  const canAct = useAccess().canAct('timesheet')
  if (entry === null) {
    return null
  }
  const state = queueDayState(entry.date, clock, logTimeMinutes)
  const closed = isHrmClosed(entry.date, clock)
  const minutes = entryMinutes(entry)
  const status = queueStatusText(
    state,
    minutesUntilRun(clock, logTimeMinutes),
    logTime,
    entry.date > clock.date ? entry.date : null,
    language,
  )
  const base = state === 'due' ? t('Retry', 'Thử lại') : t('Log now', 'Log ngay')
  const label = props.working
    ? t('Working...', 'Đang chạy...')
    : closed
      ? `${base} ${t('(after 6 PM)', '(sau 6 PM)')}`
      : base
  return (
    <>
      <p className={state === 'due' ? 'text-sm text-warning' : 'text-sm text-muted'}>{status}</p>
      {canAct ? (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          isDisabled={props.working || closed || !props.canLog}
          onPress={() => {
            props.onLogNow(entry.date)
          }}
        >
          {label}
        </Button>
      ) : null}
      <HoursBar
        minutes={minutes}
        labels={entry.tickets}
        onCommit={
          canAct
            ? (next) => {
                props.onSaveMinutes(entry.date, entry.tickets, next)
              }
            : undefined
        }
      />
      <TicketRows
        rows={entry.tickets.map((key, index) => ({ key, minutes: minutes[index] ?? 0 }))}
        urlFor={props.urlFor}
        onHours={
          canAct
            ? (key, ticketMinutes) => {
                const next = minutesWith(entry, key, ticketMinutes)
                if (next === null) {
                  props.onRejected()
                  return
                }
                props.onSaveMinutes(entry.date, entry.tickets, next)
              }
            : undefined
        }
        onRemove={
          canAct
            ? (key) => {
                props.onRemove(entry.date, key)
              }
            : undefined
        }
      />
    </>
  )
}

function EmptyBody({ props }: { readonly props: DayCardProps }): React.JSX.Element {
  const past = props.day.date < props.clock.date
  return (
    <p className={past ? 'text-sm text-warning' : 'text-sm text-muted'}>
      {t('Nothing logged - type a ticket above', 'Chưa log gì - hãy gõ ticket ở trên')}
    </p>
  )
}

function Body({ props }: { readonly props: DayCardProps }): React.JSX.Element | null {
  switch (props.day.state) {
    case 'queued':
      return <QueuedBody props={props} />
    case 'logged':
      return <LoggedBody props={props} />
    case 'empty':
      return <EmptyBody props={props} />
    case 'off':
    case 'future':
      return null
  }
}

const STATE_COLOR = {
  off: 'default',
  logged: 'success',
  queued: 'accent',
  future: 'default',
  empty: 'warning',
} as const

export function DayCard(props: DayCardProps): React.JSX.Element {
  const { day, clock, language, selected } = props
  const header = dayHeader(day.date, language)
  const today = day.date === clock.date
  const label = stateLabel(props)
  return (
    <Card
      role="group"
      aria-label={header}
      className={`cursor-pointer gap-2 p-3 ${selected ? 'ring-2 ring-accent' : ''}`}
      onClick={(event: React.MouseEvent) => {
        const inside = event.target instanceof Element ? event.target : null
        if (inside?.closest('button, input, [data-hours-bar]') === null) {
          props.onSelect(day.date)
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-semibold ${today ? 'text-accent' : ''}`}>{header}</span>
        {label === '' ? null : (
          <Chip size="sm" color={STATE_COLOR[day.state]}>
            {label}
          </Chip>
        )}
      </div>
      <Body props={props} />
    </Card>
  )
}
