import { devPriorityLevel } from './ticket.js'

export interface EpicTicket {
  readonly key: string
  readonly summary: string
  readonly status: string | null
  readonly issueType: string | null
  readonly priority: string | null
  readonly devPriority: number | null
  readonly dueDate: string | null
}

export interface Suggestion {
  readonly ticket: EpicTicket
  readonly score: number
  readonly similarKey: string | null
  readonly urgent: boolean
}

export interface RankOptions {
  readonly selectedStatus: string | null
  readonly stopWords: readonly string[]
}

const DUE_SOON_DAYS = 2
const STALE_DUE_DAYS = 14 // a due date passed longer ago belongs to an old backlog ticket
const DUE_THIS_WEEK_DAYS = 7
const DUE_SOON_POINTS = 40 // overdue too
const DUE_THIS_WEEK_POINTS = 20
const DUE_LATER_POINTS = 5
const HIGH_PRIORITY_POINTS = 20
const TOP_DEV_PRIORITY_POINTS = 15
const HIGH_DEV_PRIORITY_POINTS = 10
const SELECTED_POINTS = 10
const SIMILAR_POINTS = 15
const SIMILAR_MIN_SHARED_WORDS = 2
const MS_PER_DAY = 86_400_000

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const WORD_PATTERN = /[\p{L}\p{N}]+/gu
const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

// Words too common in ticket titles to say two tickets are about the same thing; compared after the plural "s" is cut.
const COMMON_WORDS: readonly string[] = [
  'add', 'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'not', 'are', 'all', 'new', 'use', 'via',
  'per', 'when', 'should', 'can', 'allow', 'update', 'change', 'request', 'support', 'create', 'show', 'fix',
  'make', 'need', 'based', 'only', 'instead', 'placeholder', 'phase', 'issue', 'feature', 'page', 'screen',
  'button', 'list', 'data', 'value', 'config', 'option', 'setting', 'field', 'column',
]

// Day number of a "YYYY-MM-DD" date, or null when it is not one.
function dayNumberOf(date: string | null): number | null {
  const match = date === null ? null : DATE_PATTERN.exec(date)
  if (match === null) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const milliseconds = Date.UTC(year, month - 1, day)
  const parsed = new Date(milliseconds)
  const isReal =
    parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
  return isReal ? milliseconds / MS_PER_DAY : null
}

// The month ("YYYY-MM") of "<prefix><Month> <Year>", else null (a "<prefix>2026 - Backlog" epic included).
export function epicMonth(summary: string, titlePrefix: string): string | null {
  const title = summary.trim()
  if (!title.toLowerCase().startsWith(titlePrefix.toLowerCase())) {
    return null
  }
  const match = /^([A-Za-z]+) (\d{4})$/.exec(title.slice(titlePrefix.length))
  const monthIndex = MONTH_NAMES.indexOf((match?.[1] ?? '').toLowerCase())
  if (match === null || monthIndex < 0) {
    return null
  }
  return `${match[2] ?? ''}-${String(monthIndex + 1).padStart(2, '0')}`
}

// This month's epic; early in a month, before it exists, the newest earlier one. Never a month still to come.
export function pickMonthEpic(
  epics: readonly EpicTicket[],
  today: string,
  titlePrefix: string,
): EpicTicket | null {
  const thisMonth = today.slice(0, 7)
  let best: { readonly epic: EpicTicket; readonly month: string } | null = null
  for (const epic of epics) {
    const month = ISSUE_KEY_PATTERN.test(epic.key) ? epicMonth(epic.summary, titlePrefix) : null
    if (month !== null && month <= thisMonth && (best === null || month > best.month)) {
      best = { epic, month }
    }
  }
  return best === null ? null : best.epic
}

function isHighPriority(ticket: EpicTicket): boolean {
  const priority = ticket.priority?.toLowerCase()
  return priority === 'high' || priority === 'highest'
}

// Days to the due date, negative once passed; null without one or when it is stale.
function daysLeft(ticket: EpicTicket, today: string): number | null {
  const due = dayNumberOf(ticket.dueDate)
  const todayNumber = dayNumberOf(today)
  if (due === null || todayNumber === null) {
    return null
  }
  const left = due - todayNumber
  return left < -STALE_DUE_DAYS ? null : left
}

function isUrgent(ticket: EpicTicket, today: string): boolean {
  const left = daysLeft(ticket, today)
  return isHighPriority(ticket) || (left !== null && left <= DUE_SOON_DAYS)
}

function isSelected(ticket: EpicTicket, selectedStatus: string | null): boolean {
  return (
    selectedStatus !== null &&
    ticket.status !== null &&
    ticket.status.toLowerCase() === selectedStatus.toLowerCase()
  )
}

function dueScore(left: number | null): number {
  if (left === null) {
    return 0
  }
  if (left <= DUE_SOON_DAYS) {
    return DUE_SOON_POINTS
  }
  return left <= DUE_THIS_WEEK_DAYS ? DUE_THIS_WEEK_POINTS : DUE_LATER_POINTS
}

function score(ticket: EpicTicket, similar: boolean, today: string, selectedStatus: string | null): number {
  const level = devPriorityLevel(ticket.devPriority)
  return (
    dueScore(daysLeft(ticket, today)) +
    (isHighPriority(ticket) ? HIGH_PRIORITY_POINTS : 0) +
    (level === 'top' ? TOP_DEV_PRIORITY_POINTS : 0) +
    (level === 'high' ? HIGH_DEV_PRIORITY_POINTS : 0) +
    (isSelected(ticket, selectedStatus) ? SELECTED_POINTS : 0) +
    (similar ? SIMILAR_POINTS : 0)
  )
}

function significantWords(summary: string, stopWords: ReadonlySet<string>): ReadonlySet<string> {
  const words = new Set<string>()
  for (const match of summary.toLowerCase().matchAll(WORD_PATTERN)) {
    const raw = match[0]
    const word = raw.length > 3 && raw.endsWith('s') ? raw.slice(0, -1) : raw
    if (word.length >= 3 && !/^\d+$/u.test(word) && !stopWords.has(word)) {
      words.add(word)
    }
  }
  return words
}

// The user's ticket sharing the most words (at least two) with the summary; a tie goes to the first.
function similarKeyOf(summary: string, mine: readonly EpicTicket[], stopWords: ReadonlySet<string>): string | null {
  const words = significantWords(summary, stopWords)
  let similarKey: string | null = null
  let bestShared = SIMILAR_MIN_SHARED_WORDS - 1
  for (const ticket of mine) {
    const shared = [...significantWords(ticket.summary, stopWords)].filter((word) => words.has(word)).length
    if (shared > bestShared) {
      bestShared = shared
      similarKey = ticket.key
    }
  }
  return similarKey
}

// Best first; a tie goes to the earlier due date, then keeps Jira's order. Placeholders are not specified enough to take.
export function rankSuggestions(
  candidates: readonly EpicTicket[],
  mine: readonly EpicTicket[],
  excludedKeys: ReadonlySet<string>,
  today: string,
  options: RankOptions,
): readonly Suggestion[] {
  const stopWords = new Set([...COMMON_WORDS, ...options.stopWords.map((word) => word.toLowerCase())])
  const dueOf = (ticket: EpicTicket): number => dayNumberOf(ticket.dueDate) ?? Number.MAX_SAFE_INTEGER
  return candidates
    .filter(
      (ticket) =>
        !excludedKeys.has(ticket.key) && !ticket.summary.toLowerCase().includes('placeholder'),
    )
    .map((ticket): Suggestion => {
      const similarKey = similarKeyOf(ticket.summary, mine, stopWords)
      return {
        ticket,
        score: score(ticket, similarKey !== null, today, options.selectedStatus),
        similarKey,
        urgent: isUrgent(ticket, today),
      }
    })
    .sort((a, b) => b.score - a.score || dueOf(a.ticket) - dueOf(b.ticket))
}

// Baseline check only records urgent keys; later each new urgent key is told once a day, a later one waits.
export function suggestionNotice(
  ranked: readonly Suggestion[],
  notifiedKeys: readonly string[],
  notifiedOn: string | null,
  baselineDone: boolean,
  today: string,
): { readonly noticeKeys: readonly string[]; readonly notifiedKeys: readonly string[] } {
  const urgentKeys = ranked.filter((suggestion) => suggestion.urgent).map((suggestion) => suggestion.ticket.key)
  const stillSuggested = new Set(ranked.map((suggestion) => suggestion.ticket.key))
  const keptKeys = notifiedKeys.filter((key) => stillSuggested.has(key))
  if (!baselineDone) {
    return { noticeKeys: [], notifiedKeys: [...new Set([...keptKeys, ...urgentKeys])] }
  }
  const newKeys = urgentKeys.filter((key) => !keptKeys.includes(key))
  if (newKeys.length === 0 || notifiedOn === today) {
    return { noticeKeys: [], notifiedKeys: keptKeys }
  }
  return { noticeKeys: newKeys, notifiedKeys: [...keptKeys, ...newKeys] }
}
