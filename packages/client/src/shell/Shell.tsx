import { lazy, Suspense, useState } from 'react'
import { BoardPage } from '../board/BoardPage.js'
import { HeaderSlotContext } from '../ui/HeaderSlot.js'
import { useAccess } from '../api/useMe.js'
import { useSettings } from '../api/useSettings.js'
import { useNow, useTimesheetView } from '../api/useTimesheet.js'
import { useWork } from '../api/useWork.js'
import { useWorkspace } from '../api/useWorkspace.js'
import { useSchedulesView } from '../schedules/useSchedules.js'
import { needsAttention } from '../timesheet/timesheetState.js'
import { NoticeToasts } from '../notices/NoticeToasts.js'
import { TicketUpdateHost } from '../board/TicketUpdateHost.js'
import { useNotices } from '../notices/useNotices.js'
import { Sidebar } from './Sidebar.js'
import { TabBar } from './TabBar.js'
import { TopBar } from './TopBar.js'
import { navigateTo, PAGE_IDS, type PageId } from './pages.js'
import { useNarrow } from './useNarrow.js'
import { useSidebarCollapsed } from './useSidebarCollapsed.js'
import { zonedClock } from '@workday/core'
import { useIdlePreload } from './useIdlePreload.js'

// Tickets is the start page and ships in the main bundle; the others load on first open or once the browser idles.
const loadSettings = async () => import('../settings/SettingsPage.js')
const loadTimesheet = async () => import('../timesheet/TimesheetPage.js')
const loadWorkspace = async () => import('../workspace/WorkspacePage.js')
const loadInsights = async () => import('../insights/InsightsPage.js')
const SettingsPage = lazy(async () => ({ default: (await loadSettings()).SettingsPage }))
const TimesheetPage = lazy(async () => ({ default: (await loadTimesheet()).TimesheetPage }))
const WorkspacePage = lazy(async () => ({ default: (await loadWorkspace()).WorkspacePage }))
const InsightsPage = lazy(async () => ({ default: (await loadInsights()).InsightsPage }))
const LAZY_PAGE_LOADERS = [loadSettings, loadTimesheet, loadWorkspace, loadInsights]

interface ShellProps {
  readonly page: PageId
}

// The fade sits inside Suspense, so it plays when the page shows rather than while its chunk still loads.
function PageContent({ page }: ShellProps): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <div key={page} className="h-full animate-fade-in">
        <PageBody page={page} />
      </div>
    </Suspense>
  )
}

function PageBody({ page }: ShellProps): React.JSX.Element {
  if (page === 'settings') {
    return <SettingsPage />
  }
  if (page === 'tickets') {
    return <BoardPage />
  }
  if (page === 'timesheet') {
    return <TimesheetPage />
  }
  if (page === 'workspace') {
    return <WorkspacePage />
  }
  return <InsightsPage />
}

// True when the Timesheet page has something to do: today's reminder or a queued day past its run.
function useTimesheetAttention(): boolean {
  const view = useTimesheetView(useAccess().canSee('timesheet')).data
  const timeZone = useSettings().data?.config.timeZone
  const now = useNow()
  if (view === undefined || timeZone === undefined) {
    return false
  }
  return needsAttention(view, zonedClock(timeZone, now), timeZone)
}

function useWaitingSessions(): number {
  const sessions = useWorkspace().data?.sessions ?? []
  return sessions.filter((session) => session.wait !== null).length
}

export function Shell({ page }: ShellProps): React.JSX.Element {
  const narrow = useNarrow()
  const [collapsed, toggleCollapsed] = useSidebarCollapsed()
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null)
  const attention = useTimesheetAttention()
  const waiting = useWaitingSessions()
  const todoAttention = useWork().data?.attention ?? 0
  const alerts = useNotices(page)
  const schedulesDot = useSchedulesView(true).data?.scan.unseenBad === true
  useIdlePreload(LAZY_PAGE_LOADERS)
  return (
    <div className="app-shell flex h-dvh overflow-hidden bg-background pt-[env(safe-area-inset-top)] text-foreground">
      {narrow ? null : (
        <Sidebar
          current={page}
          onSelect={navigateTo}
          attention={attention}
          settingsBadge={schedulesDot ? 1 : 0}
          pages={PAGE_IDS}
          workspaceBadge={waiting}
          boardBadge={todoAttention}
          collapsed={collapsed}
        />
      )}
      <div
        className={`flex min-w-0 flex-1 flex-col${narrow ? ' pb-[calc(4.5rem+max(0.5rem,calc(env(safe-area-inset-bottom)-0.75rem)))]' : ''}`}
      >
        <TopBar onToggleMenu={narrow ? undefined : toggleCollapsed} slotRef={setHeaderSlot} />
        <main className="min-h-0 flex-1 overflow-auto">
          <HeaderSlotContext.Provider value={headerSlot}>
            <PageContent page={page} />
          </HeaderSlotContext.Provider>
        </main>
      </div>
      {narrow ? (
        <TabBar
          current={page}
          onSelect={navigateTo}
          attention={attention}
          pages={PAGE_IDS}
          workspaceBadge={waiting}
        />
      ) : null}
      <NoticeToasts alerts={alerts} />
      <TicketUpdateHost />
    </div>
  )
}
