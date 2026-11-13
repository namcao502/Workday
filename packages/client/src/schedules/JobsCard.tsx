import { Chip } from '@heroui/react'
import type { AppJobName, SchedulesView } from '@workday/core'
import { t } from '../i18n.js'
import { Section } from '../ui/Section.js'
import { formatDuration, formatWhen, jobName, outcomeText } from './scheduleFormat.js'

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
    <Section title={t('In-app jobs', 'Việc chạy trong app')}>
      <ul className="m-0 list-none p-0">
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
            <li
              key={job}
              className="px-2.5 py-1.5 text-sm even:bg-surface-secondary"
              title={tooltip}
            >
              <div className="flex items-center justify-between gap-2">
                <strong>{jobName(job)}</strong>
                <span className="text-muted">
                  {nextRunAt === null
                    ? ''
                    : t(
                        `Next ${formatWhen(nextRunAt, timeZone)}`,
                        `Lần tới ${formatWhen(nextRunAt, timeZone)}`,
                      )}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-muted">
                <span>{scheduleText(job, pollMinutes, logTime)}</span>
                <span className="flex items-center gap-1.5">
                  {last === undefined ? null : (
                    <Chip size="sm" color={last.ok ? 'success' : 'danger'}>
                      {outcomeText(last.ok ? 'ok' : 'failed')}
                    </Chip>
                  )}
                  {last === undefined
                    ? t('No runs yet', 'Chưa chạy lần nào')
                    : [formatWhen(last.startedAt, timeZone), last.summary ?? '']
                        .filter((part) => part !== '')
                        .join(': ')}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
