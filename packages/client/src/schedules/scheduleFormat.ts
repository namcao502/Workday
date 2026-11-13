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
      return t('Running', 'Đang chạy')
    case 'ok':
      return t('Finished', 'Xong')
    case 'withProblems':
      return t('With problems', 'Có lỗi')
    case 'stopped':
      return t('Stopped', 'Bị dừng')
    case 'failed':
      return t('Failed', 'Thất bại')
  }
}

export function dayLabel(day: ScanDay): string {
  switch (day) {
    case 'daily':
      return t('Every day', 'Mỗi ngày')
    case 'mon':
      return t('Mon', 'Thứ 2')
    case 'tue':
      return t('Tue', 'Thứ 3')
    case 'wed':
      return t('Wed', 'Thứ 4')
    case 'thu':
      return t('Thu', 'Thứ 5')
    case 'fri':
      return t('Fri', 'Thứ 6')
    case 'sat':
      return t('Sat', 'Thứ 7')
    case 'sun':
      return t('Sun', 'CN')
  }
}

export function jobName(job: AppJobName): string {
  switch (job) {
    case 'jiraPoll':
      return t('Jira check', 'Kiểm tra Jira')
    case 'prCheck':
      return t('Pull request check', 'Kiểm tra pull request')
    case 'teamsCheck':
      return t('Teams check', 'Kiểm tra Teams')
    case 'timesheetRun':
      return t('Auto-log to TSC + HRM', 'Tự log TSC + HRM')
    case 'catchUp':
      return t('Catch-up log', 'Log bù')
  }
}
