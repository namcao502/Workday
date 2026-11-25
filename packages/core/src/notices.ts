import type { WaitReason } from './claudeAttention.js'
import type { ScanOutcome } from './api.js'
import type { PrVote } from './prTracking.js'
import type { TicketField } from './ticket/ticketChanges.js'
import type { WeekReviewItem } from './timesheet/weekReview.js'
import { coreText, type CoreTextKey, type TextParams } from './i18n/text.js'

export type NoticeTopic =
  | 'claude'
  | 'pr'
  | 'jira'
  | 'teams'
  | 'teamsMention'
  | 'suggestions'
  | 'knowledge'
  | 'log'
  | 'other'
export type NoticeTone = 'info' | 'success' | 'error'

export type NoticeEvent =
  | { readonly type: 'claudeWait'; readonly subject: string; readonly wait: WaitReason }
  | {
      readonly type: 'prMerged' | 'prBuildFailed' | 'prConflicted'
      readonly key: string
      readonly branch: string
    }
  | {
      readonly type: 'prComments'
      readonly key: string
      readonly branch: string
      readonly count: number
    }
  | {
      readonly type: 'prVote'
      readonly key: string
      readonly branch: string
      readonly vote: PrVote
    }
  | { readonly type: 'prReviewRequested'; readonly author: string; readonly title: string }
  | { readonly type: 'devMerged'; readonly key: string }
  | { readonly type: 'deployed'; readonly key: string; readonly moved: boolean }
  | { readonly type: 'deployFailed'; readonly key: string; readonly pipeline: string }
  | {
      readonly type: 'movedToReadyToTest' | 'alreadyPastReadyToTest' | 'ticketMissing'
      readonly key: string
    }
  | { readonly type: 'transitionFailed'; readonly key: string; readonly status: string }
  | { readonly type: 'scanBad'; readonly outcome: ScanOutcome }
  | { readonly type: 'suggestionsUrgent'; readonly keys: readonly string[] }
  | {
      readonly type: 'teamsMessage'
      readonly key: string
      readonly title: string
      readonly sender: string
      readonly mention: boolean
    }
  | { readonly type: 'qcBugFixed'; readonly key: string; readonly parentKey: string }
  | { readonly type: 'newTickets'; readonly keys: readonly string[] }
  | {
      readonly type: 'qcBugLogged'
      readonly key: string
      readonly parentKey: string
      readonly summary: string
    }
  | { readonly type: 'ticketsDone' | 'ticketsReopened'; readonly keys: readonly string[] }
  | { readonly type: 'autoStartFailed'; readonly key: string; readonly code: string }
  | { readonly type: 'dbReviewApproved'; readonly key: string; readonly approver: string }
  | {
      readonly type: 'ticketUpdated'
      readonly key: string
      readonly fields: readonly TicketField[]
      readonly changedBy: string | null
    }
  // The 18:00 run or the catch-up: kept entries wait for a retry, timedOut when the run hit its deadline.
  | {
      readonly type: 'logRun'
      readonly logged: number
      readonly kept: number
      readonly timedOut: boolean
    }
  | { readonly type: 'logReminder' }
  | { readonly type: 'weekReview'; readonly items: readonly WeekReviewItem[] }

export type NoticeTarget =
  | { readonly kind: 'schedules' }
  | { readonly kind: 'board'; readonly key: string | null }
  | { readonly kind: 'workspace'; readonly tab: string; readonly session: string }
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'teams'; readonly key: string; readonly conversationId: string }
  | { readonly kind: 'timesheet' }
  | { readonly kind: 'ticketUpdate'; readonly key: string } // opens the old / new comparison

export interface Notice {
  readonly id: number
  readonly at: string // ISO instant
  readonly topic: NoticeTopic
  readonly tone: NoticeTone
  readonly event: NoticeEvent
  readonly target: NoticeTarget | null
  readonly place: string | null // what the notice is about; opening that place reads it
  readonly read: boolean
}

export interface NoticeChannels {
  readonly toast: boolean
  readonly desktop: boolean
  readonly phone: boolean
}

export type NoticePrefs = Readonly<Partial<Record<NoticeTopic, Partial<NoticeChannels>>>>

export const NOTICE_CAP = 100
const READ_LIFETIME_MS = 24 * 60 * 60 * 1000
const UNREAD_LIFETIME_MS = 7 * READ_LIFETIME_MS

// Toast always; desktop for what waits on the user, phone for the PR and Jira news.
const DEFAULT_CHANNELS: Readonly<Record<NoticeTopic, NoticeChannels>> = {
  claude: { toast: true, desktop: true, phone: false },
  pr: { toast: true, desktop: false, phone: true },
  jira: { toast: true, desktop: false, phone: true },
  teams: { toast: true, desktop: true, phone: false },
  teamsMention: { toast: true, desktop: true, phone: true },
  suggestions: { toast: true, desktop: false, phone: false },
  knowledge: { toast: true, desktop: true, phone: false },
  // The phone gets the run's own push already.
  log: { toast: true, desktop: true, phone: false },
  other: { toast: true, desktop: true, phone: false },
}

export function addNotice(notices: readonly Notice[], notice: Notice): readonly Notice[] {
  return [...notices, notice].slice(-NOTICE_CAP)
}

// Counted from when the notice came: a read one goes after a day, an unread one after a week. The same list when none expired.
export function removeExpired(notices: readonly Notice[], now: string): readonly Notice[] {
  const nowMs = Date.parse(now)
  const kept = notices.filter(
    (notice) =>
      nowMs - Date.parse(notice.at) <= (notice.read ? READ_LIFETIME_MS : UNREAD_LIFETIME_MS),
  )
  return kept.length === notices.length ? notices : kept
}

// An id no longer kept changes nothing.
export function markRead(notices: readonly Notice[], id: number): readonly Notice[] {
  if (!notices.some((notice) => notice.id === id && !notice.read)) {
    return notices
  }
  return notices.map((notice) => (notice.id === id ? { ...notice, read: true } : notice))
}

// The same list when no unread notice is about that place.
export function markReadAt(notices: readonly Notice[], place: string): readonly Notice[] {
  if (!notices.some((notice) => !notice.read && notice.place === place)) {
    return notices
  }
  return notices.map((notice) =>
    !notice.read && notice.place === place ? { ...notice, read: true } : notice,
  )
}

export function markAllRead(notices: readonly Notice[]): readonly Notice[] {
  if (notices.every((notice) => notice.read)) {
    return notices
  }
  return notices.map((notice) => (notice.read ? notice : { ...notice, read: true }))
}

// A saved choice overrides one channel; the rest keep the topic's default.
export function noticeChannels(topic: NoticeTopic, prefs: NoticePrefs): NoticeChannels {
  return { ...DEFAULT_CHANNELS[topic], ...prefs[topic] }
}

type Say = (key: CoreTextKey, params?: TextParams) => string

const WAIT_KEYS: Readonly<Record<WaitReason, CoreTextKey>> = {
  finished: 'notices.claudeFinished',
  permission: 'notices.claudePermission',
  question: 'notices.claudeQuestion',
}

const VOTE_KEYS: Readonly<Partial<Record<PrVote, CoreTextKey>>> = {
  approved: 'notices.prApproved',
  waitingForAuthor: 'notices.prWaitingForAuthor',
  rejected: 'notices.prRejected',
}

const FIELD_KEYS: Readonly<Record<TicketField, CoreTextKey>> = {
  summary: 'notices.fieldSummary',
  description: 'notices.fieldDescription',
  attachments: 'notices.fieldAttachments',
  dueDate: 'notices.fieldDueDate',
  eta: 'notices.fieldEta',
  devPriority: 'notices.fieldDevPriority',
}

const ISSUE_KEYS: Readonly<Record<WeekReviewItem['issue'], CoreTextKey>> = {
  notFound: 'notices.weekReviewNotFound',
  notMine: 'notices.weekReviewNotMine',
  tscOnly: 'notices.weekReviewTscOnly',
  hrmOnly: 'notices.weekReviewHrmOnly',
}

const SCAN_KEYS: Readonly<Partial<Record<ScanOutcome, CoreTextKey>>> = {
  stopped: 'notices.scanStopped',
  failed: 'notices.scanFailed',
}

function prText(event: NoticeEvent, say: Say): string | null {
  switch (event.type) {
    case 'prMerged':
      return say('notices.prMerged', { key: event.key, branch: event.branch })
    case 'prBuildFailed':
      return say('notices.prBuildFailed', { key: event.key, branch: event.branch })
    case 'prConflicted':
      return say('notices.prConflicted', { key: event.key, branch: event.branch })
    case 'prComments':
      return say('notices.prComments', { key: event.key, branch: event.branch, count: event.count })
    case 'prVote':
      return say(VOTE_KEYS[event.vote] ?? 'notices.prNewVote', {
        key: event.key,
        branch: event.branch,
      })
    case 'prReviewRequested':
      return say('notices.prReviewRequested', { author: event.author, title: event.title })
    default:
      return null
  }
}

function deployText(event: NoticeEvent, say: Say): string | null {
  switch (event.type) {
    case 'devMerged':
      return say('notices.devMerged', { key: event.key })
    case 'deployed':
      return say(event.moved ? 'notices.deployedMoved' : 'notices.deployedAsk', { key: event.key })
    case 'deployFailed':
      return say('notices.deployFailed', { key: event.key, pipeline: event.pipeline })
    default:
      return null
  }
}

// "MDP-12 (Mon): not yours, did you mean MDP-21?" (port of WeekReview.ItemText).
function weekReviewItemText(item: WeekReviewItem, say: Say): string {
  const weekday = new Date(`${item.date}T00:00:00Z`).getUTCDay()
  const day = say('notices.weekdays').split(',')[weekday] ?? item.date
  const suggestion =
    item.suggestedKey === null
      ? ''
      : say('notices.weekReviewSuggestion', { key: item.suggestedKey })
  return say('notices.weekReviewItem', {
    key: item.ticketKey,
    day,
    issue: say(ISSUE_KEYS[item.issue]),
    suggestion,
  })
}

// One notice for the week; the HRM hint only when HRM holds a wrong ticket, since its MCP has no edit or delete.
function weekReviewText(items: readonly WeekReviewItem[], say: Say): string {
  const list = items.map((item) => weekReviewItemText(item, say)).join('; ')
  const isHrmWrong = items.some((item) => item.issue !== 'tscOnly')
  return say(isHrmWrong ? 'notices.weekReviewFixHrm' : 'notices.weekReview', {
    count: items.length,
    list,
  })
}

function logRunText(logged: number, kept: number, timedOut: boolean, say: Say): string {
  if (timedOut) {
    return say('notices.logTimedOut', { kept })
  }
  return kept === 0 ? say('notices.logDone', { logged }) : say('notices.logKept', { logged, kept })
}

function jiraPollText(event: NoticeEvent, say: Say): string | null {
  switch (event.type) {
    case 'newTickets':
      return say('notices.newTickets', { keys: event.keys.join(', ') })
    case 'qcBugLogged':
      return say('notices.qcBugLogged', {
        key: event.key,
        parentKey: event.parentKey,
        summary: event.summary,
      })
    case 'ticketsDone':
      return say('notices.ticketsDone', { keys: event.keys.join(', ') })
    case 'ticketsReopened':
      return say('notices.ticketsReopened', { keys: event.keys.join(', ') })
    case 'autoStartFailed':
      return say('notices.autoStartFailed', { key: event.key, code: event.code })
    default:
      return null
  }
}

function ticketText(event: NoticeEvent, say: Say): string | null {
  switch (event.type) {
    case 'movedToReadyToTest':
      return say('notices.movedToReadyToTest', { key: event.key })
    case 'alreadyPastReadyToTest':
      return say('notices.alreadyPastReadyToTest', { key: event.key })
    case 'ticketMissing':
      return say('notices.ticketMissing', { key: event.key })
    case 'transitionFailed':
      return say('notices.transitionFailed', { key: event.key, status: event.status })
    case 'ticketUpdated': {
      const fields = event.fields.map((field) => say(FIELD_KEYS[field])).join(', ')
      return event.changedBy === null
        ? say('notices.ticketUpdated', { key: event.key, fields })
        : say('notices.ticketUpdatedBy', { key: event.key, fields, changedBy: event.changedBy })
    }
    default:
      return null
  }
}

// One sentence per event, the same meaning as the C# app's notices; branch is a label like "FE Portal dev".
// The text of each language lives in i18n/en.ts and vi.ts.
export function noticeText(event: NoticeEvent, language: 'en' | 'vi'): string {
  const say: Say = (key, params) => coreText(language, key, params)
  const known =
    prText(event, say) ??
    deployText(event, say) ??
    jiraPollText(event, say) ??
    ticketText(event, say)
  if (known !== null) {
    return known
  }
  switch (event.type) {
    case 'claudeWait':
      return say('notices.claudeWait', {
        subject: event.subject,
        sentence: say(WAIT_KEYS[event.wait]),
      })
    case 'scanBad':
      return say(SCAN_KEYS[event.outcome] ?? 'notices.scanProblems')
    case 'suggestionsUrgent':
      return say('notices.suggestionsUrgent', { keys: event.keys.join(', ') })
    case 'teamsMessage':
      return say(event.mention ? 'notices.teamsMention' : 'notices.teamsMessage', {
        sender: event.sender,
        key: event.key,
        title: event.title,
      })
    case 'qcBugFixed':
      return say('notices.qcBugFixed', { key: event.key, parentKey: event.parentKey })
    case 'dbReviewApproved':
      return say('notices.dbReviewApproved', { key: event.key, approver: event.approver })
    case 'logRun':
      return logRunText(event.logged, event.kept, event.timedOut, say)
    case 'weekReview':
      return weekReviewText(event.items, say)
    case 'logReminder':
      return say('notices.logReminder')
    default:
      return ''
  }
}
