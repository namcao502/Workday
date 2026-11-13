import { formatDateOnly, getLanguage, t } from '../i18n.js'

const THOUSAND = 1000
const MILLION = 1_000_000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
export const EMPTY_CELL = '–'

function oneDecimal(value: number): string {
  return String(Math.round(value * 10) / 10)
}

// 950, 12.3k, 1.2M: one decimal, a trailing .0 dropped (TokenText.Format in the C# app).
export function formatTokens(tokens: number): string {
  if (tokens < THOUSAND) {
    return String(tokens)
  }
  return tokens < MILLION ? `${oneDecimal(tokens / THOUSAND)}k` : `${oneDecimal(tokens / MILLION)}M`
}

// "7.5h": at most two decimals.
export function formatHours(hours: number): string {
  return `${String(Math.round(hours * 100) / 100)}h`
}

// "1h 05m"-style Claude time; a dash when there is none.
export function formatClaudeTime(seconds: number): string {
  const minutes = Math.round(seconds / SECONDS_PER_MINUTE)
  if (minutes === 0) {
    return EMPTY_CELL
  }
  const unit = t('m', 'p')
  return `${String(Math.floor(minutes / MINUTES_PER_HOUR))}h ${String(minutes % MINUTES_PER_HOUR)}${unit}`
}

export function dayLabel(day: string): string {
  return formatDateOnly(day, getLanguage())
}
