import type { Holiday } from '@workday/core'
import { t } from '../i18n.js'

// The built-in yearly holidays carry no name of their own, so they read in the app language.
function builtInName(date: string): string | null {
  switch (date) {
    case '01-01':
      return t('timesheet.newYearsDay')
    case '04-30':
      return t('timesheet.reunificationDay')
    case '05-01':
      return t('timesheet.labourDay')
    case '09-02':
      return t('timesheet.nationalDay')
    case '11-24':
      return t('timesheet.vietnamCultureDay')
    default:
      return null
  }
}

export function holidayName(holiday: Holiday): string {
  return holiday.name ?? builtInName(holiday.date) ?? t('timesheet.publicHoliday')
}
