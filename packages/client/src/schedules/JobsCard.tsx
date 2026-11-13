import type { AppJobName, SchedulesView } from '@workday/core'
import { t } from '../i18n.js'
import { formatDuration, formatWhen, jobName } from './scheduleFormat.js'

const JOBS: readonly AppJobName[] = ['jiraPoll', 'prCheck', 'teamsCheck', 'timesheetRun', 'catchUp']
const SHOWN_RUNS = 10

interface JobsCardProps {
  readonly jobs: SchedulesView['jobs']
  readonly timeZone: string
  readonly pollMinutes: number
  readonly logTime: string
}

function scheduleText(job: AppJobName, pollMinutes: number, logTime: string): string {
  switch (job) {
    case 'jiraPoll':
      return t(`every ${String(pollMinutes)} min`, `mỗi ${String(pollMinutes)} phút`)
    // Fixed server intervals (PrScheduler 5 min, Teams watcher 2 min), not the Jira poll setting.
    case 'prCheck':
      return t('every 5 min', 'mỗi 5 phút')
    case 'teamsCheck':
      return t('every 2 min', 'mỗi 2 phút')
    case 'timesheetRun':
      return t(`every day at ${logTime}`, `mỗi ngày lúc ${logTime}`)
    case 'catchUp':
      return t('when the app starts', 'khi app khởi động')
  }
}

export function JobsCard({
  jobs,
  timeZone,
  pollMinutes,
  logTime,
}: JobsCardProps): React.JSX.Element {
  return (
    <section className="card schedules-card">
      <h2 className="section-title">{t('In-app jobs', 'Việc chạy trong app')}</h2>
      <ul className="job-list">
        {JOBS.map((job) => {
          const { runs, nextRunAt } = jobs[job]
          // The server keeps a job's runs oldest first.
          const last = runs.at(-1)
          const tooltip =
            runs.length === 0
              ? t('No runs yet', 'Chưa chạy lần nào')
              : runs
                  .toReversed()
                  .slice(0, SHOWN_RUNS)
                  .map(
                    (run) =>
                      `${formatWhen(run.startedAt, timeZone)} (${formatDuration(Date.parse(run.endedAt) - Date.parse(run.startedAt))}): ${run.summary ?? ''}`,
                  )
                  .join('\n')
          return (
            <li key={job} className="job-row" title={tooltip}>
              <div className="job-line">
                <strong>{jobName(job)}</strong>
                <span className="muted">
                  {nextRunAt === null
                    ? ''
                    : t(
                        `Next ${formatWhen(nextRunAt, timeZone)}`,
                        `Lần tới ${formatWhen(nextRunAt, timeZone)}`,
                      )}
                </span>
              </div>
              <div className="job-line muted">
                <span>{scheduleText(job, pollMinutes, logTime)}</span>
                <span className="job-last">
                  <span
                    className={`run-dot ${last === undefined ? 'run-none' : last.ok ? 'run-ok' : 'run-failed'}`}
                    aria-hidden="true"
                  />
                  {last === undefined
                    ? t('No runs yet', 'Chưa chạy lần nào')
                    : `${formatWhen(last.startedAt, timeZone)}: ${last.summary ?? ''}`}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
