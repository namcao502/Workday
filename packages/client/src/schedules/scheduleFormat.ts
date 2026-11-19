import type { AppJobName, ScanDay, ScanOutcome } from '@workday/core'
import { formatShortDate, getLanguage, t } from '../i18n.js'

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60

export function formatWhen(iso: string, timeZone: string): string {
  return formatShortDate(new Date(iso), getLanguage(), timeZone)
}

// "1h 05m", "4m 10s" or "12s".
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / MS_PER_SECOND))
  const seconds = totalSeconds % SECONDS_PER_MINUTE
  const totalMinutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE)
  if (totalMinutes === 0) {
    return `${String(seconds)}s`
  }
  if (totalMinutes < MINUTES_PER_HOUR) {
    return `${String(totalMinutes)}m ${String(seconds).padStart(2, '0')}s`
  }
  const minutes = totalMinutes % MINUTES_PER_HOUR
  return `${String(Math.floor(totalMinutes / MINUTES_PER_HOUR))}h ${String(minutes).padStart(2, '0')}m`
}

export function outcomeText(outcome: ScanOutcome): string {
  switch (outcome) {
    case 'running':
      return t('schedules.running')
    case 'ok':
      return t('schedules.finished')
    case 'withProblems':
      return t('schedules.withProblems')
    case 'stopped':
      return t('schedules.stopped')
    case 'failed':
      return t('schedules.failed')
  }
}

export function dayLabel(day: ScanDay): string {
  switch (day) {
    case 'daily':
      return t('schedules.everyDay')
    case 'mon':
      return t('schedules.mon')
    case 'tue':
      return t('schedules.tue')
    case 'wed':
      return t('schedules.wed')
    case 'thu':
      return t('schedules.thu')
    case 'fri':
      return t('schedules.fri')
    case 'sat':
      return t('schedules.sat')
    case 'sun':
      return t('schedules.sun')
  }
}

export function jobName(job: AppJobName): string {
  switch (job) {
    case 'jiraPoll':
      return t('schedules.jiraCheck')
    case 'prCheck':
      return t('schedules.pullRequestCheck')
    case 'teamsCheck':
      return t('schedules.teamsCheck')
    case 'timesheetRun':
      return t('schedules.autoLogToTscHrm')
    case 'catchUp':
      return t('schedules.catchUpLog')
  }
}
