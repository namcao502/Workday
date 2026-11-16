import { useState } from 'react'
import { BoardPage } from '../board/BoardPage.js'
import { HeaderSlotContext } from '../ui/HeaderSlot.js'
import { useAccess } from '../api/useMe.js'
import { useSettings } from '../api/useSettings.js'
import { useNow, useTimesheetView } from '../api/useTimesheet.js'
import { useWork } from '../api/useWork.js'
import { useWorkspace } from '../api/useWorkspace.js'
import { InsightsPage } from '../insights/InsightsPage.js'
import { DevicePage } from '../remote/DevicePage.js'
import { useSchedulesView } from '../schedules/useSchedules.js'
import { SettingsPage } from '../settings/SettingsPage.js'
import { TimesheetPage } from '../timesheet/TimesheetPage.js'
import { needsAttention } from '../timesheet/timesheetState.js'
import { NoticeToasts } from '../notices/NoticeToasts.js'
import { useNotices } from '../notices/useNotices.js'
import { WorkspacePage } from '../workspace/WorkspacePage.js'
import { Sidebar } from './Sidebar.js'
import { TabBar } from './TabBar.js'
import { TopBar } from './TopBar.js'
import { navigateTo, visiblePages, type PageId } from './pages.js'
import { useNarrow } from './useNarrow.js'
import { useSidebarCollapsed } from './useSidebarCollapsed.js'
import { zonedClock } from '@workday/core'

interface ShellProps {
  readonly page: PageId
}

function PageContent({ page }: ShellProps): React.JSX.Element {
  const access = useAccess()
  if (page === 'settings') {
    return access.mode === 'remote' ? <DevicePage /> : <SettingsPage />
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

export function Shell({ page: requested }: ShellProps): React.JSX.Element {
  const narrow = useNarrow()
  const [collapsed, toggleCollapsed] = useSidebarCollapsed()
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null)
  const pages = visiblePages(useAccess())
  // A hash to a hidden page shows the first visible one.
  const page = pages.includes(requested) ? requested : (pages[0] ?? 'settings')
  const attention = useTimesheetAttention()
  const waiting = useWaitingSessions()
  const todoAttention = useWork().data?.attention ?? 0
  const alerts = useNotices(page)
  const schedulesDot = useSchedulesView(useAccess().mode !== 'remote').data?.scan.unseenBad === true
  return (
    <div className="flex h-dvh bg-background text-foreground">
      {narrow ? null : (
        <Sidebar
          current={page}
          onSelect={navigateTo}
          attention={attention}
          settingsBadge={schedulesDot ? 1 : 0}
          pages={pages}
          workspaceBadge={waiting}
          boardBadge={todoAttention}
          collapsed={collapsed}
        />
      )}
      <div className={`flex min-w-0 flex-1 flex-col${narrow ? ' pb-20' : ''}`}>
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
          pages={pages}
          workspaceBadge={waiting}
        />
      ) : null}
      <NoticeToasts alerts={alerts} />
    </div>
  )
}
