import { useQueryClient } from '@tanstack/react-query'
import {
  addDays,
  buildLogDays,
  evenSplit,
  isHrmClosed,
  mondayOf,
  parseTicketKeys,
  WORK_MINUTES,
  zonedClock,
  type QueueEntry,
  type SettingsView,
  type TimesheetView,
} from '@workday/core'
import { useEffect, useRef, useState } from 'react'
import { queryKeys, readWeek, type LogTarget } from '../api/client.js'
import { useSettings } from '../api/useSettings.js'
import {
  useNow,
  useRefreshTimesheet,
  useTicketChecks,
  useTimesheetView,
} from '../api/useTimesheet.js'
import { errorText } from '../errors.js'
import { t } from '../i18n.js'
import { ConfirmDialog } from './ConfirmDialog.js'
import { DayCard } from './DayCard.js'
import { LogInput, type LogAction } from './LogInput.js'
import { TimesheetBanners } from './TimesheetBanners.js'
import { showReminder, logTimeMinutes } from './timesheetState.js'
import { dateLabel, formatMinutes } from './timesheetText.js'
import { useColumns } from './useColumns.js'
import { useTimesheetActions } from './useTimesheetActions.js'
import { WeekHeader } from './WeekHeader.js'
import { WeekTotals } from './WeekTotals.js'
import './timesheet.css'

const WORKDAYS = 5
type Confirming = 'off' | 'clear' | null

// One read with sniffing per app load; kept in the query cache so a test gets a fresh one.
function useFirstRead(thisMonday: string): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    queryClient.setQueryDefaults(queryKeys.timesheetVisited, { gcTime: Infinity })
    if (queryClient.getQueryData(queryKeys.timesheetVisited) === true) {
      return
    }
    queryClient.setQueryData(queryKeys.timesheetVisited, true)
    readWeek(thisMonday, true).catch(() => undefined)
  }, [queryClient, thisMonday])
}

interface BodyProps {
  readonly view: TimesheetView
  readonly config: SettingsView['config']
}

function TimesheetBody({ view, config }: BodyProps): React.JSX.Element {
  const { language, timeZone } = config
  const clock = zonedClock(timeZone, useNow())
  const refresh = useRefreshTimesheet()
  const actions = useTimesheetActions(language)
  const thisMonday = mondayOf(view.today)
  const [monday, setMonday] = useState(thisMonday)
  const [date, setDate] = useState(clock.date)
  const [text, setText] = useState('')
  const [custom, setCustom] = useState<readonly number[] | null>(null)
  const [confirming, setConfirming] = useState<Confirming>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const columns = useColumns(gridRef)
  useFirstRead(thisMonday)

  const projectKey = config.jira?.projectKey ?? null
  const parsed = parseTicketKeys(text, projectKey)
  const typedKeys = parsed.tickets
  const usesCustom = custom !== null && custom.length === typedKeys.length
  const typedMinutes = usesCustom ? custom : evenSplit(typedKeys.length)
  const checks = useTicketChecks(typedKeys)
  const total = typedMinutes.reduce((sum, minutes) => sum + minutes, 0)
  const problem = ((): string | null => {
    if (parsed.invalid.length !== 0) {
      return errorText({ code: 'invalidTicket' })
    }
    if (typedMinutes.some((minutes) => !(minutes > 0))) {
      return t('each ticket needs > 0h', 'mỗi ticket cần > 0h')
    }
    return total > WORK_MINUTES ? `${formatMinutes(total)} - ${t('over 8h', 'quá 8h')}` : null
  })()

  const week = view.week !== null && view.week.monday === monday ? view.week : null
  const reading = week === null || week.reading
  const weekdays = Array.from({ length: WORKDAYS }, (_, index) => addDays(monday, index))
  const days = buildLogDays(weekdays, week?.coverage ?? null, view.queue, clock.date)
  const outside = view.queue.filter(
    (entry) => !days.some((day) => day.queued !== null && day.date === entry.date),
  )
  const baseUrl = config.jira?.baseUrl
  const urlFor = (key: string): string => (baseUrl === undefined ? '' : `${baseUrl}/browse/${key}`)
  const typed = { date, tickets: typedKeys, minutes: usesCustom ? typedMinutes : null }
  const clearTyped = (): void => {
    setText('')
    setCustom(null)
  }
  const canLog = view.tscConnected && view.hrmConnected
  const working = actions.working

  function shiftWeek(weeks: -1 | 1): void {
    const next = addDays(monday, weeks * 7)
    setMonday(next)
    readWeek(next, false).catch(() => undefined)
  }

  function onAction(action: LogAction): void {
    if (action === 'add') {
      void actions.addTyped(typed, clearTyped)
    } else if (action === 'off' || action === 'clear') {
      setConfirming(action)
    } else {
      const targets: Record<'now' | 'tsc' | 'hrm', LogTarget> = {
        now: 'both',
        tsc: 'tsc',
        hrm: 'hrm',
      }
      void actions.logTyped(typed, targets[action], clearTyped)
    }
  }

  function renderCard(day: ReturnType<typeof buildLogDays>[number]): React.JSX.Element {
    return (
      <DayCard
        key={day.date}
        day={day}
        clock={clock}
        language={language}
        logTime={view.logTime}
        logTimeMinutes={logTimeMinutes(view.logTime)}
        selected={day.date === date}
        canLog={canLog}
        working={working !== null && working.action === 'drain' && working.date === day.date}
        hrmTasks={week?.hrmTasks ?? []}
        review={week?.review ?? []}
        urlFor={urlFor}
        onSelect={setDate}
        onLogNow={(target) => void actions.drainDay(target)}
        onSaveMinutes={(target, tickets, minutes) =>
          void actions.saveMinutes(target, tickets, minutes)
        }
        onRemove={(target, key) => void actions.removeTicket(target, key)}
        onRejected={() => {
          actions.setStatus({
            tone: 'danger',
            text: t(
              'Each ticket needs > 0h and the day up to 8h',
              'Mỗi ticket cần > 0h và cả ngày tối đa 8h',
            ),
            detail: null,
          })
        }}
      />
    )
  }

  const queuedViews = (entries: readonly QueueEntry[]): ReturnType<typeof buildLogDays> =>
    entries.map((entry) => ({ date: entry.date, state: 'queued', coverage: null, queued: entry }))

  return (
    <section className="page timesheet-page">
      <h1 className="page-title">{t('Timesheet', 'Bảng công')}</h1>
      <TimesheetBanners view={view} reminder={showReminder(view, clock, timeZone)} />
      <LogInput
        date={date}
        text={text}
        typed={typedKeys.map((key, index) => ({ key, minutes: typedMinutes[index] ?? 0 }))}
        checks={checks}
        problem={problem}
        working={
          working !== null && working.action !== 'drain' && working.action !== 'save'
            ? working.action
            : null
        }
        hrmClosed={isHrmClosed(date, clock)}
        tscConnected={view.tscConnected}
        hrmConnected={view.hrmConnected}
        queueEmpty={view.queue.length === 0}
        urlFor={urlFor}
        onDate={setDate}
        onText={(next) => {
          setText(next)
          setCustom(null)
        }}
        onTypedHours={(key, minutes) => {
          setCustom(
            typedMinutes.map((value, index) => (typedKeys[index] === key ? minutes : value)),
          )
        }}
        onUseKey={(from, to) => {
          setText(typedKeys.map((key) => (key === from ? to : key)).join(', '))
        }}
        onAction={onAction}
      />
      {actions.status === null ? null : (
        <p
          className={actions.status.tone === 'ok' ? 'status' : 'status danger'}
          title={actions.status.detail ?? undefined}
        >
          {actions.status.text}
        </p>
      )}
      {outside.length === 0 ? null : (
        <section className="queued-block">
          <span className="section-label">{t('QUEUED', 'HÀNG ĐỢI')}</span>
          <div
            className="day-grid"
            style={{ gridTemplateColumns: `repeat(${String(columns)}, 1fr)` }}
          >
            {queuedViews(outside).map(renderCard)}
          </div>
        </section>
      )}
      <WeekHeader
        monday={monday}
        thisMonday={thisMonday}
        today={clock.date}
        week={week}
        language={language}
        timeZone={timeZone}
        reading={reading}
        onShift={shiftWeek}
        onReread={() => {
          readWeek(monday, true)
            .then(refresh)
            .catch(() => undefined)
        }}
      />
      <div
        ref={gridRef}
        className={reading ? 'day-grid reading' : 'day-grid'}
        style={{ gridTemplateColumns: `repeat(${String(columns)}, 1fr)` }}
      >
        {days.map(renderCard)}
      </div>
      <WeekTotals
        hrmTasks={week?.hrmTasks ?? null}
        queue={view.queue}
        weekdays={weekdays}
        urlFor={urlFor}
      />
      {confirming === null ? null : (
        <ConfirmDialog
          message={
            confirming === 'off'
              ? t(
                  `Mark ${dateLabel(date, language)} as OFF in TSC? This overwrites the day's cell.`,
                  `Đánh dấu ${dateLabel(date, language)} là OFF trong TSC? Ô của ngày này sẽ bị ghi đè.`,
                )
              : t('Remove everything from the queue?', 'Xóa mọi mục trong hàng đợi?')
          }
          confirmLabel={
            confirming === 'off' ? t('Log OFF', 'Log nghỉ') : t('Clear queue', 'Xóa hàng đợi')
          }
          onCancel={() => {
            setConfirming(null)
          }}
          onConfirm={() => {
            setConfirming(null)
            void (confirming === 'off' ? actions.logOffDay(date) : actions.clear())
          }}
        />
      )}
    </section>
  )
}

export function TimesheetPage(): React.JSX.Element {
  const settings = useSettings()
  const view = useTimesheetView()
  if (settings.data === undefined || view.data === undefined) {
    return (
      <section className="page timesheet-page">
        <h1 className="page-title">{t('Timesheet', 'Bảng công')}</h1>
        <p className="muted">{t('Loading...', 'Đang tải...')}</p>
      </section>
    )
  }
  return <TimesheetBody view={view.data} config={settings.data.config} />
}
