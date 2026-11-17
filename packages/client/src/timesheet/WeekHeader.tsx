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
    return t('THIS WEEK', 'TUẦN NÀY')
  }
  if (monday === addDays(thisMonday, -7)) {
    return t('LAST WEEK', 'TUẦN TRƯỚC')
  }
  return monday === addDays(thisMonday, 7) ? t('NEXT WEEK', 'TUẦN SAU') : t('WEEK', 'TUẦN')
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
        aria-label={t('Previous week', 'Tuần trước')}
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
        aria-label={t('Next week', 'Tuần sau')}
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
        aria-label={t('Read again', 'Đọc lại')}
      >
        <span
          title={t(
            'Reads TSC again; a browser runs in the background with the saved sign-in',
            'Đọc lại TSC; trình duyệt chạy ngầm bằng phiên đăng nhập đã lưu',
          )}
          className="flex items-center gap-1"
        >
          <ArrowRotateRight />
          {t('Read again', 'Đọc lại')}
        </span>
      </Button>
    </div>
  )
}

function stepLabel(id: WeekStepId): string {
  switch (id) {
    case 'tsc':
      return t('TSC sheet', 'Sheet TSC')
    case 'hrmHours':
      return t('HRM hours', 'Giờ HRM')
    case 'hrmOff':
      return t('Days off', 'Ngày nghỉ')
    case 'hrmTasks':
      return t('HRM tasks', 'Task HRM')
    case 'jira':
      return t('Jira tickets', 'Ticket Jira')
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
      <span>{t("Reading the week's logs:", 'Đang đọc log của tuần:')}</span>
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
  let status: React.ReactNode = ''
  if (steps.length !== 0) {
    status = <ReadSteps steps={steps} />
  } else if (props.reading) {
    status = t("Reading the week's logs...", 'Đang đọc log của tuần...')
  } else if (week?.readAt != null) {
    const clock = formatClock(new Date(week.readAt), language, props.timeZone)
    status = t(`Read at ${clock}`, `Đã đọc lúc ${clock}`)
  }
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
      {hrm === null ? null : (
        <span>{`HRM ${String(hrm.hours)}h / ${String(hrm.targetHours)}h`}</span>
      )}
      {coverage === null ? null : <span>{`TSC ${tscCount(coverage, today)}`}</span>}
      {coverage?.some((day) => day.tscState === 'noToken') === true ? (
        <span>
          {t(
            'TSC not read yet: Read again reads it (a browser runs in the background).',
            'Chưa đọc TSC: bấm Đọc lại để đọc (trình duyệt chạy ngầm).',
          )}
        </span>
      ) : null}
      <span className="ml-auto" aria-live="polite">
        {status}
      </span>
    </div>
  )
}
