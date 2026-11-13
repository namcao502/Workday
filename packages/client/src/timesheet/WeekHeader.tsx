import { addDays, hrmWeekTotal, type DayCoverage, type WeekState } from '@workday/core'
import { formatClock, formatDateOnly, t, type Language } from '../i18n.js'

const WORKDAYS = 5

interface WeekHeaderProps {
  readonly monday: string
  readonly thisMonday: string
  readonly today: string
  readonly week: WeekState | null
  readonly language: Language
  readonly timeZone: string
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

export function WeekHeader(props: WeekHeaderProps): React.JSX.Element {
  const { monday, week, language, today } = props
  const coverage = week?.coverage ?? null
  const range = `${formatDateOnly(monday, language)} - ${formatDateOnly(addDays(monday, WORKDAYS - 1), language)}`
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
    <div className="week-header">
      <div className="week-title-row">
        <span className="section-label">{titleFor(monday, props.thisMonday)}</span>
        <span className="muted">{range}</span>
        <button
          type="button"
          className="wd-button ghost"
          disabled={props.reading}
          onClick={() => {
            props.onShift(-1)
          }}
        >
          {t('Previous week', 'Tuần trước')}
        </button>
        <button
          type="button"
          className="wd-button ghost"
          disabled={props.reading}
          onClick={() => {
            props.onShift(1)
          }}
        >
          {t('Next week', 'Tuần sau')}
        </button>
        <button
          type="button"
          className="wd-button ghost"
          disabled={props.reading}
          onClick={props.onReread}
        >
          {t('Read again', 'Đọc lại')}
        </button>
      </div>
      <div className="week-totals muted">
        {hrm === null ? null : (
          <span>{`HRM ${String(hrm.hours)}h / ${String(hrm.targetHours)}h`}</span>
        )}
        {coverage === null ? null : <span>{`TSC ${tscCount(coverage, today)}`}</span>}
        <span className="week-status" aria-live="polite">
          {status}
        </span>
      </div>
    </div>
  )
}
