import { useSettings } from '../api/useSettings.js'
import { actionErrorText } from '../api/useWork.js'
import { t } from '../i18n.js'
import { JobsCard } from './JobsCard.js'
import { ScanCard } from './ScanCard.js'
import './schedules.css'
import { REFRESH_MS, useMarkSeenOnOpen, useSchedulesView } from './useSchedules.js'

export function SchedulesPage(): React.JSX.Element {
  const schedules = useSchedulesView(true, REFRESH_MS)
  const config = useSettings().data?.config
  useMarkSeenOnOpen()
  const view = schedules.data

  return (
    <section className="page schedules-page">
      <h1 className="page-title">{t('Schedules', 'Lịch chạy')}</h1>
      {schedules.error === null ? null : (
        <p className="status danger" role="alert">
          {actionErrorText(schedules.error)}
        </p>
      )}
      {view === undefined ? null : (
        <>
          <ScanCard
            scan={view.scan}
            timeZone={config?.timeZone ?? 'UTC'}
            onRefresh={() => {
              void schedules.refetch()
            }}
          />
          <JobsCard
            jobs={view.jobs}
            timeZone={config?.timeZone ?? 'UTC'}
            pollMinutes={config?.pollMinutes ?? 5}
            logTime={config?.timesheet.logTime ?? '18:00'}
          />
        </>
      )}
    </section>
  )
}
