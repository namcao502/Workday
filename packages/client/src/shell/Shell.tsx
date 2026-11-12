import { BoardPage } from '../board/BoardPage.js'
import { useSettings } from '../api/useSettings.js'
import { useNow, useTimesheetView } from '../api/useTimesheet.js'
import { SettingsPage } from '../settings/SettingsPage.js'
import { t } from '../i18n.js'
import { TimesheetPage } from '../timesheet/TimesheetPage.js'
import { needsAttention } from '../timesheet/timesheetState.js'
import { Sidebar } from './Sidebar.js'
import { TabBar } from './TabBar.js'
import { navigateTo, pageLabel, type PageId } from './pages.js'
import { useNarrow } from './useNarrow.js'
import { zonedClock } from '@workday/core'

interface ShellProps {
  readonly page: PageId
}

function PageContent({ page }: ShellProps): React.JSX.Element {
  if (page === 'settings') {
    return <SettingsPage />
  }
  if (page === 'tickets') {
    return <BoardPage />
  }
  if (page === 'timesheet') {
    return <TimesheetPage />
  }
  return (
    <section className="page">
      <h1 className="page-title">{pageLabel(page)}</h1>
      <p className="muted">{t('Coming soon', 'Sắp ra mắt')}</p>
    </section>
  )
}

// True when the Timesheet page has something to do: today's reminder or a queued day past its run.
function useTimesheetAttention(): boolean {
  const view = useTimesheetView().data
  const timeZone = useSettings().data?.config.timeZone
  const now = useNow()
  if (view === undefined || timeZone === undefined) {
    return false
  }
  return needsAttention(view, zonedClock(timeZone, now), timeZone)
}

export function Shell({ page }: ShellProps): React.JSX.Element {
  const narrow = useNarrow()
  const attention = useTimesheetAttention()
  return (
    <div className={narrow ? 'shell shell-narrow' : 'shell'}>
      {narrow ? null : <Sidebar current={page} onSelect={navigateTo} attention={attention} />}
      <main className="shell-content">
        <PageContent page={page} />
      </main>
      {narrow ? <TabBar current={page} onSelect={navigateTo} attention={attention} /> : null}
    </div>
  )
}
