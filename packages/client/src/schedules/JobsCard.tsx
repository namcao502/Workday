import { Chip } from '@heroui/react'
import type { AppJobName, SchedulesView } from '@workday/core'
import { t } from '../i18n.js'
import { Section } from '../ui/Section.js'
import { formatDuration, formatWhen, jobName, outcomeText } from './scheduleFormat.js'
import { Tip } from '../ui/Tip.js'

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
      return t('schedules.everyMin', { pollMinutes: String(pollMinutes) })
    // Fixed server intervals (PrScheduler 5 min, Teams watcher 2 min), not the Jira poll setting.
    case 'prCheck':
      return t('schedules.every5Min')
    case 'teamsCheck':
      return t('schedules.every2Min')
    case 'timesheetRun':
      return t('schedules.everyDayAt', { logTime })
    case 'catchUp':
      return t('schedules.whenTheAppStarts')
  }
}

export function JobsCard({
  jobs,
  timeZone,
  pollMinutes,
  logTime,
}: JobsCardProps): React.JSX.Element {
  return (
    <Section title={t('schedules.inAppJobs')}>
      <ul className="m-0 list-none p-0">
        {JOBS.map((job) => {
          const { runs, nextRunAt } = jobs[job]
          // The server keeps a job's runs oldest first.
          const last = runs.at(-1)
          const tooltip =
            runs.length === 0
              ? t('schedules.noRunsYet')
              : runs
                  .toReversed()
                  .slice(0, SHOWN_RUNS)
                  .map(
                    (run) =>
                      `${formatWhen(run.startedAt, timeZone)} (${formatDuration(Date.parse(run.endedAt) - Date.parse(run.startedAt))}): ${run.summary ?? ''}`,
                  )
                  .join('\n')
          return (
            <li key={job} className="text-sm even:bg-surface-secondary">
              <Tip className="block px-2.5 py-1.5" content={tooltip}>
                <div className="flex items-center justify-between gap-2">
                  <strong>{jobName(job)}</strong>
                  <span className="text-muted">
                    {nextRunAt === null
                      ? ''
                      : t('schedules.next', { formatWhen: formatWhen(nextRunAt, timeZone) })}
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
                      ? t('schedules.noRunsYet')
                      : [formatWhen(last.startedAt, timeZone), last.summary ?? '']
                          .filter((part) => part !== '')
                          .join(': ')}
                  </span>
                </div>
              </Tip>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
