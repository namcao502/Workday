import type { WorkdayConfig } from '@workday/core'

export type Language = WorkdayConfig['language']

let currentLanguage: Language = 'en'

// Called while rendering the app root, so every component below already reads the new language.
export function setLanguage(language: Language): void {
  currentLanguage = language
}

export function t(en: string, vi: string): string {
  return currentLanguage === 'vi' ? vi : en
}

// "YYYY-MM-DD" as a short date with no time and no zone shift, e.g. "Nov 20".
export function formatDateOnly(date: string, language: Language): string {
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`))
}

// "9:05 AM" in the configured zone.
export function formatClock(date: Date, language: Language, timeZone: string): string {
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

// 12-hour clock with AM/PM in both languages, in the configured zone, not the browser's.
export function formatShortDate(date: Date, language: Language, timeZone: string): string {
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}
