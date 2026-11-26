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
import { useAccess } from '../api/useMe.js'
import { useSettings } from '../api/useSettings.js'
import {
  useDaySuggestions,
  useNow,
  useRefreshDaySuggestions,
  useRefreshTimesheet,
  useTicketChecks,
  useTimesheetView,
} from '../api/useTimesheet.js'
import { errorText } from '../errors.js'
import { t } from '../i18n.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
import { Page } from '../ui/Page.js'
import { DayCard } from './DayCard.js'
import { DaySuggestions } from './DaySuggestions.js'
import { LogInput, type LogAction } from './LogInput.js'
import { TimesheetBanners } from './TimesheetBanners.js'
import { bentoDays, logTimeMinutes, showReminder } from './timesheetState.js'
import { dateLabel, formatMinutes } from './timesheetText.js'
import { useColumns } from './useColumns.js'
import { useTimesheetActions } from './useTimesheetActions.js'
import { WeekHeader, WeekNav } from './WeekHeader.js'
import { WeekTotals } from './WeekTotals.js'
import { Tip } from '../ui/Tip.js'
import { SkeletonRows } from '../ui/Skeleton.js'

const WORKDAYS = 5
type Confirming = 'off' | 'clear' | null

// As in the WPF app: the first view of the current week reads with a background browser (the saved sign-in), and the
// server keeps the token until it expires. A server with no week at all (it restarted under an open page) is asked
// again without a browser, or the page would load forever. Kept in the query cache so a test gets a fresh one.
function useFirstRead(thisMonday: string, hasWeek: boolean): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    queryClient.setQueryDefaults(queryKeys.timesheetVisited, { gcTime: Infinity })
    const visited = queryClient.getQueryData(queryKeys.timesheetVisited) === true
    if (visited && hasWeek) {
      return
    }
    queryClient.setQueryData(queryKeys.timesheetVisited, true)
    readWeek(thisMonday, !visited).catch(() => undefined)
  }, [queryClient, thisMonday, hasWeek])
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
  const canAct = useAccess().canAct('timesheet')
  const thisMonday = mondayOf(view.today)
  const [monday, setMonday] = useState(thisMonday)
  const [date, setDate] = useState(clock.date)
  const [text, setText] = useState('')
  const [custom, setCustom] = useState<readonly number[] | null>(null)
  const [confirming, setConfirming] = useState<Confirming>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const columns = useColumns(gridRef)
  useFirstRead(thisMonday, view.week !== null)
  const daySuggestions = useDaySuggestions(date, canAct)
  const refreshDaySuggestions = useRefreshDaySuggestions()
  const refreshSuggestions = (): void => {
    void refreshDaySuggestions()
  }

  const projectKey = config.jira?.projectKey ?? null
  const parsed = parseTicketKeys(text, projectKey)
  const typedKeys = parsed.tickets
  const usesCustom = custom !== null && custom.length === typedKeys.length
  const typedMinutes = usesCustom ? custom : evenSplit(typedKeys.length)
  const checks = useTicketChecks(typedKeys)
  const queuedChecks = useTicketChecks([...new Set(view.queue.flatMap((entry) => entry.tickets))])
  const summaries = Object.fromEntries(
    Object.values(queuedChecks).flatMap((check) =>
      check.summary === null ? [] : [[check.key, check.summary]],
    ),
  )
  const total = typedMinutes.reduce((sum, minutes) => sum + minutes, 0)
  const problem = ((): string | null => {
    if (parsed.invalid.length !== 0) {
      return errorText({ code: 'invalidTicket' })
    }
    if (typedMinutes.some((minutes) => !(minutes > 0))) {
      return t('timesheet.eachTicketNeeds0h')
    }
    return total > WORK_MINUTES ? `${formatMinutes(total)} - ${t('timesheet.over8h')}` : null
  })()

  const week = view.week !== null && view.week.monday === monday ? view.week : null
  const reading = week === null || week.reading
  const weekdays = Array.from({ length: WORKDAYS }, (_, index) => addDays(monday, index))
  const days = buildLogDays(weekdays, week?.coverage ?? null, view.queue, clock.date)
  const bento = bentoDays(days, clock.date, columns)
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
        big={day.date === bento.big}
        summaries={summaries}
        canLog={canLog}
        reading={reading}
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
      />
    )
  }

  const queuedViews = (entries: readonly QueueEntry[]): ReturnType<typeof buildLogDays> =>
    entries.map((entry) => ({ date: entry.date, state: 'queued', coverage: null, queued: entry }))

  return (
    <Page title={t('timesheet.timesheet')} wide className="max-w-[1300px]">
      <TimesheetBanners view={view} reminder={showReminder(view, clock, timeZone)} />
      {canAct ? (
        <DaySuggestions
          suggestions={daySuggestions.data ?? []}
          busy={working !== null}
          onAdd={(tickets, minutes) => {
            void actions.addTyped({ date, tickets, minutes }, refreshSuggestions)
          }}
        />
      ) : null}
      {canAct ? (
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
      ) : null}
      {actions.status === null ? null : (
        <p className={actions.status.tone === 'ok' ? 'text-sm text-muted' : 'text-sm text-danger'}>
          <Tip content={actions.status.detail}>{actions.status.text}</Tip>
        </p>
      )}
      {outside.length === 0 ? null : (
        <section className="flex flex-col gap-2">
          <span className="text-xs font-semibold tracking-wide text-muted">
            {t('timesheet.queued2')}
          </span>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${String(columns)}, 1fr)` }}
          >
            {queuedViews(outside).map(renderCard)}
          </div>
        </section>
      )}
      <WeekNav
        monday={monday}
        thisMonday={thisMonday}
        language={language}
        reading={reading}
        onShift={shiftWeek}
        onReread={() => {
          readWeek(monday, true)
            .then(refresh)
            .catch(() => undefined)
        }}
      />
      <WeekHeader
        monday={monday}
        today={clock.date}
        week={week}
        language={language}
        timeZone={timeZone}
        reading={reading}
      />
      <div
        ref={gridRef}
        // Rows share one height, so a day alone on the last row lines up with the rest. Reading dims each
        // card's content, not the grid: opacity on the grid would cut the cards' glass off the backdrop.
        className={`grid gap-3 ${columns > 1 ? 'auto-rows-fr' : ''} ${reading ? 'pointer-events-none [&>*>*]:opacity-70' : ''}`}
        style={{ gridTemplateColumns: `repeat(${String(columns)}, 1fr)` }}
      >
        {bento.days.map(renderCard)}
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
              ? t('timesheet.markAsOffInTscThis', { dateLabel: dateLabel(date, language) })
              : t('timesheet.removeEverythingFromTheQueue')
          }
          confirmLabel={confirming === 'off' ? t('timesheet.logOff2') : t('timesheet.clearQueue2')}
          onCancel={() => {
            setConfirming(null)
          }}
          onConfirm={() => {
            setConfirming(null)
            void (confirming === 'off' ? actions.logOffDay(date) : actions.clear())
          }}
        />
      )}
    </Page>
  )
}

export function TimesheetPage(): React.JSX.Element {
  const settings = useSettings()
  const view = useTimesheetView()
  if (settings.data === undefined || view.data === undefined) {
    return (
      <Page title={t('timesheet.timesheet')} wide className="max-w-[1300px]">
        <SkeletonRows label={t('timesheet.loading')} rows={4} />
      </Page>
    )
  }
  return <TimesheetBody view={view.data} config={settings.data.config} />
}
