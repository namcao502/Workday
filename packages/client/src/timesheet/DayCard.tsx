import { Button, Card, Chip } from '@heroui/react'
import { CalendarXmark } from '@gravity-ui/icons'
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
import { holidayName } from './holidayName.js'
import { TicketRows } from './TicketRows.js'
import { dayHeader, DONE_MARK, formatMinutes, issueText, queueStatusText } from './timesheetText.js'
import { Tip } from '../ui/Tip.js'
import { SkeletonRows } from '../ui/Skeleton.js'

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
  readonly reading: boolean // the week read is still running: an empty day may only be unread
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
      return day.coverage?.holiday == null ? t('timesheet.leave') : t('timesheet.publicHoliday')
    case 'logged':
      return `${DONE_MARK} ${formatMinutes(Math.round((day.coverage?.hrmHours ?? 0) * MINUTES_PER_HOUR))}`
    case 'queued':
      return t('timesheet.queued')
    case 'future':
      return t('timesheet.notYet')
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
  return coverage.tscState === 'failed' ? t('timesheet.tscNotRead') : t('timesheet.tscNotReadYet')
}

function LoggedBody({ props }: { readonly props: DayCardProps }): React.JSX.Element {
  const { day, hrmTasks, review } = props
  const tasks = hrmTasks.filter((task) => task.date === day.date && task.workingSeconds > 0)
  const items = review.filter((item) => item.date === day.date)
  const tooltip = items.map((item) => `${item.ticketKey}: ${issueText(item)}`).join('\n')
  return (
    <>
      {tasks.length === 0 ? null : (
        <TicketRows
          rows={tasks.map((task) => ({
            key: task.ticketKey,
            minutes: Math.round(task.workingSeconds / SECONDS_PER_MINUTE),
          }))}
          urlFor={props.urlFor}
        />
      )}
      <p className="text-sm">{tscLine(day)}</p>
      {items.length === 0 ? null : (
        <p className="text-sm text-warning">
          <Tip content={tooltip}>
            {t('timesheet.ticketSToCheck', { length: String(items.length) })}
          </Tip>
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
  const base = state === 'due' ? t('timesheet.retry') : t('timesheet.logNow')
  const label = props.working
    ? t('timesheet.working')
    : closed
      ? `${base} ${t('timesheet.after6Pm')}`
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
  if (props.reading) {
    return <SkeletonRows label={t('timesheet.reading')} rows={2} />
  }
  const past = props.day.date < props.clock.date
  return (
    <p className={past ? 'text-sm text-warning' : 'text-sm text-muted'}>
      {t('timesheet.nothingLoggedTypeATicketAbove')}
    </p>
  )
}

// Why the day is off: the holiday's name, or the leave request, said approved only once HRM approves it.
function offReason(day: LogDayView): string {
  const holiday = day.coverage?.holiday ?? null
  if (holiday !== null) {
    return holidayName(holiday)
  }
  return day.coverage?.leaveApproved === true
    ? t('timesheet.leaveApprovedInHrm')
    : t('timesheet.leaveDay')
}

function OffBody({ day }: { readonly day: LogDayView }): React.JSX.Element {
  return <p className="text-sm font-medium text-violet-700 dark:text-violet-300">{offReason(day)}</p>
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
      return <OffBody day={props.day} />
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

// Off days get their own violet chip with an icon, apart from the grey "not yet".
const OFF_CHIP = 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
// Diagonal stripes, as calendars draw a day nobody works.
// Important: the season glass sets its own background image and, in rain, a tile size on every card.
const OFF_CARD =
  'border border-dashed border-violet-400/70 bg-[image:repeating-linear-gradient(135deg,transparent_0_10px,rgb(139_92_246/0.12)_10px_20px)]! bg-auto!'

// A press on a control or the hours bar does its own job; picking the day then would steal its focus.
const OWN_PRESS = 'button, input, textarea, select, a'

export function DayCard(props: DayCardProps): React.JSX.Element {
  const { day, clock, language, selected } = props
  const header = dayHeader(day.date, language)
  const today = day.date === clock.date
  const label = stateLabel(props)
  const off = day.state === 'off'
  return (
    <Card
      role="group"
      aria-label={header}
      className={`card-pressable gap-2 p-3 ${selected ? 'bg-accent-soft' : ''} ${off ? OFF_CARD : ''}`}
      data-off={off}
      onClick={(event) => {
        if (!(event.target instanceof Element) || event.target.closest(OWN_PRESS) === null) {
          props.onSelect(day.date)
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className={`cursor-pointer text-left font-semibold ${today ? 'text-accent' : ''}`}
          aria-pressed={selected}
          onClick={() => {
            props.onSelect(day.date)
          }}
        >
          {header}
        </button>
        {label === '' ? null : (
          <Chip size="sm" color={STATE_COLOR[day.state]} className={off ? OFF_CHIP : ''}>
            {off ? <CalendarXmark width={12} height={12} aria-hidden="true" /> : null}
            {label}
          </Chip>
        )}
      </div>
      <Body props={props} />
    </Card>
  )
}
