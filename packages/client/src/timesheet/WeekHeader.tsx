import { Button } from '@heroui/react'
import { ChevronLeft, ChevronRight, ArrowRotateRight } from '@gravity-ui/icons'
import { addDays, hrmWeekTotal, type DayCoverage, type WeekState } from '@workday/core'
import { formatClock, formatDateOnly, t, type Language } from '../i18n.js'

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

// Week switcher shown in the page title row.
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
      <div className="flex flex-col items-end leading-tight">
        <span className="text-xs font-semibold tracking-wide text-muted">
          {titleFor(monday, thisMonday)}
        </span>
        <span className="text-sm text-muted">{range}</span>
      </div>
      <Button
        isIconOnly
        variant="ghost"
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
        variant="ghost"
        size="sm"
        aria-label={t('Next week', 'Tuần sau')}
        isDisabled={reading}
        onPress={() => {
          onShift(1)
        }}
      >
        <ChevronRight />
      </Button>
      <Button variant="ghost" size="sm" isDisabled={reading} onPress={onReread}>
        <ArrowRotateRight />
        {t('Read again', 'Đọc lại')}
      </Button>
    </div>
  )
}

export function WeekHeader(props: WeekHeaderProps): React.JSX.Element {
  const { week, language, today } = props
  const coverage = week?.coverage ?? null
  const hrm = coverage === null ? null : hrmWeekTotal(coverage, today)
  const status = props.reading
    ? t("Reading the week's logs...", 'Đang đọc log của tuần...')
    : week?.readAt != null
      ? t(
          `Read at ${formatClock(new Date(week.readAt), language, props.timeZone)}`,
          `Đã đọc lúc ${formatClock(new Date(week.readAt), language, props.timeZone)}`,
        )
      : ''
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
      {hrm === null ? null : (
        <span>{`HRM ${String(hrm.hours)}h / ${String(hrm.targetHours)}h`}</span>
      )}
      {coverage === null ? null : <span>{`TSC ${tscCount(coverage, today)}`}</span>}
      <span className="ml-auto" aria-live="polite">
        {status}
      </span>
    </div>
  )
}
