import { Button, Spinner } from '@heroui/react'
import { ChevronLeft, ChevronRight, ArrowRotateRight } from '@gravity-ui/icons'
import {
  addDays,
  hrmWeekTotal,
  type DayCoverage,
  type WeekState,
  type WeekStep,
  type WeekStepId,
} from '@workday/core'
import { formatClock, formatDateOnly, t, type Language } from '../i18n.js'
import { DONE_MARK } from './timesheetText.js'
import { Tip } from '../ui/Tip.js'

const WORKDAYS = 5

interface WeekHeaderProps {
  readonly monday: string
  readonly today: string
  readonly week: WeekState | null
  readonly language: Language
  readonly timeZone: string
  readonly reading: boolean
}

interface WeekNavProps {
  readonly monday: string
  readonly thisMonday: string
  readonly language: Language
  readonly reading: boolean
  readonly onShift: (weeks: -1 | 1) => void
  readonly onReread: () => void
}

function titleFor(monday: string, thisMonday: string): string {
  if (monday === thisMonday) {
    return t('timesheet.thisWeek')
  }
  if (monday === addDays(thisMonday, -7)) {
    return t('timesheet.lastWeek')
  }
  return monday === addDays(thisMonday, 7) ? t('timesheet.nextWeek') : t('timesheet.week')
}

// Days up to today that are not off: how many carry TSC text, out of how many.
function tscCount(coverage: readonly DayCoverage[], today: string): string {
  const days = coverage.filter((day) => day.date <= today && !day.isOff)
  const done = days.filter((day) => (day.tscText ?? '').trim() !== '').length
  return `${String(done)} / ${String(days.length)}`
}

// Week switcher shown between the log input and the week's cards.
export function WeekNav({
  monday,
  thisMonday,
  language,
  reading,
  onShift,
  onReread,
}: WeekNavProps): React.JSX.Element {
  const range = `${formatDateOnly(monday, language)} - ${formatDateOnly(addDays(monday, WORKDAYS - 1), language)}`
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="mr-2 flex flex-col items-start leading-tight">
        <span className="text-xs font-semibold tracking-wide text-muted">
          {titleFor(monday, thisMonday)}
        </span>
        <span className="text-sm text-muted">{range}</span>
      </div>
      <Button
        isIconOnly
        variant="secondary"
        size="sm"
        aria-label={t('timesheet.previousWeek')}
        isDisabled={reading}
        onPress={() => {
          onShift(-1)
        }}
      >
        <ChevronLeft />
      </Button>
      <Button
        isIconOnly
        variant="secondary"
        size="sm"
        aria-label={t('timesheet.nextWeek2')}
        isDisabled={reading}
        onPress={() => {
          onShift(1)
        }}
      >
        <ChevronRight />
      </Button>
      <Button
        variant="secondary"
        size="sm"
        isDisabled={reading}
        onPress={onReread}
        aria-label={t('timesheet.readAgain')}
      >
        <Tip content={t('timesheet.readsTscAgainABrowserRuns')} className="flex items-center gap-1">
          <ArrowRotateRight />
          {t('timesheet.readAgain')}
        </Tip>
      </Button>
    </div>
  )
}

function stepLabel(id: WeekStepId): string {
  switch (id) {
    case 'tsc':
      return t('timesheet.tscSheet')
    case 'hrmHours':
      return t('timesheet.hrmHours')
    case 'hrmOff':
      return t('timesheet.daysOff')
    case 'hrmTasks':
      return t('timesheet.hrmTasks')
    case 'jira':
      return t('timesheet.jiraTickets')
  }
}

function StepMark({ state }: { readonly state: WeekStep['state'] }): React.JSX.Element {
  if (state === 'running') {
    return <Spinner size="sm" aria-hidden="true" />
  }
  if (state === 'done') {
    return <span className="text-success">{DONE_MARK}</span>
  }
  return state === 'failed' ? <span className="text-danger">!</span> : <span>-</span>
}

// What a week read is doing right now, one mark per part, so a slow read says what it waits for.
function ReadSteps({ steps }: { readonly steps: readonly WeekStep[] }): React.JSX.Element {
  return (
    <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      <span>{t('timesheet.readingTheWeekSLogs')}</span>
      {steps.map((step) => (
        <span key={step.id} className="inline-flex items-center gap-1" data-state={step.state}>
          <StepMark state={step.state} />
          {stepLabel(step.id)}
        </span>
      ))}
    </span>
  )
}

export function WeekHeader(props: WeekHeaderProps): React.JSX.Element {
  const { week, language, today } = props
  const coverage = week?.coverage ?? null
  const hrm = coverage === null ? null : hrmWeekTotal(coverage, today)
  const steps = week?.steps ?? []
  const offDays = coverage?.filter((day) => day.isOff).length ?? 0
  let status: React.ReactNode = ''
  if (steps.length !== 0) {
    status = <ReadSteps steps={steps} />
  } else if (props.reading) {
    status = t('timesheet.readingTheWeekSLogs2')
  } else if (week?.readAt != null) {
    const clock = formatClock(new Date(week.readAt), language, props.timeZone)
    status = t('timesheet.readAt', { clock })
  }
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
      {hrm === null ? null : (
        <span>{`HRM ${String(hrm.hours)}h / ${String(hrm.targetHours)}h`}</span>
      )}
      {coverage === null ? null : <span>{`TSC ${tscCount(coverage, today)}`}</span>}
      {offDays === 0 ? null : (
        <span className="font-medium text-violet-700 dark:text-violet-300">
          {t('timesheet.weekWorkdaysOff', {
            work: String(WORKDAYS - offDays),
            off: String(offDays),
          })}
        </span>
      )}
      {coverage?.some((day) => day.tscState === 'noToken') === true ? (
        <span>{t('timesheet.tscNotReadYetReadAgain')}</span>
      ) : null}
      <span className="ml-auto" aria-live="polite">
        {status}
      </span>
    </div>
  )
}
