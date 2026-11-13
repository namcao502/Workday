import type { WaitReason } from './claudeAttention.js'
import type { PrVote } from './prTracking.js'

export type NoticeTopic =
  | 'claude'
  | 'pr'
  | 'jira'
  | 'teams'
  | 'teamsMention'
  | 'suggestions'
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
  | { readonly type: 'suggestionsUrgent'; readonly keys: readonly string[] }
  | {
      readonly type: 'teamsMessage'
      readonly key: string
      readonly title: string
      readonly sender: string
      readonly mention: boolean
    }

export type NoticeTarget =
  | { readonly kind: 'board'; readonly key: string | null }
  | { readonly kind: 'workspace'; readonly tab: string; readonly session: string }
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'teams'; readonly key: string; readonly conversationId: string }

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
  other: { toast: true, desktop: true, phone: false },
}

export function addNotice(notices: readonly Notice[], notice: Notice): readonly Notice[] {
  return [...notices, notice].slice(-NOTICE_CAP)
}

// Counted from when the notice came: a read one goes after a day, an unread one after a week. The same list when none expired.
export function removeExpired(notices: readonly Notice[], now: string): readonly Notice[] {
  const nowMs = Date.parse(now)
  const kept = notices.filter(
    (notice) => nowMs - Date.parse(notice.at) <= (notice.read ? READ_LIFETIME_MS : UNREAD_LIFETIME_MS),
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

function waitSentence(wait: WaitReason, vi: boolean): string {
  switch (wait) {
    case 'finished':
      return vi ? 'Claude đã xong - đến lượt bạn.' : 'Claude is done - your turn.'
    case 'permission':
      return vi ? 'Claude cần bạn cho phép.' : 'Claude needs your permission.'
    case 'question':
      return vi ? 'Claude đang hỏi bạn.' : 'Claude is asking you something.'
  }
}

function voteSentence(key: string, branch: string, vote: PrVote, vi: boolean): string {
  switch (vote) {
    case 'approved':
      return vi ? `${key}: PR (${branch}) đã được duyệt.` : `${key}: PR (${branch}) approved.`
    case 'waitingForAuthor':
      return vi
        ? `${key}: PR (${branch}) đang chờ anh sửa.`
        : `${key}: PR (${branch}) waits for your changes.`
    case 'rejected':
      return vi ? `${key}: PR (${branch}) bị từ chối.` : `${key}: PR (${branch}) was rejected.`
    default:
      return vi ? `${key}: PR (${branch}) có phiếu mới.` : `${key}: PR (${branch}) has a new vote.`
  }
}

function prText(event: NoticeEvent, vi: boolean): string | null {
  switch (event.type) {
    case 'prMerged':
      return vi ? `${event.key}: PR (${event.branch}) đã merge.` : `${event.key}: PR (${event.branch}) merged.`
    case 'prBuildFailed':
      return vi
        ? `${event.key}: build lỗi trên PR (${event.branch}).`
        : `${event.key}: build failed on PR (${event.branch}).`
    case 'prConflicted':
      return vi
        ? `${event.key}: PR (${event.branch}) bị conflict.`
        : `${event.key}: PR (${event.branch}) has merge conflicts.`
    case 'prComments':
      return vi
        ? `${event.key}: ${String(event.count)} comment PR mới (${event.branch}).`
        : `${event.key}: ${String(event.count)} new PR comment(s) (${event.branch}).`
    case 'prVote':
      return voteSentence(event.key, event.branch, event.vote, vi)
    case 'prReviewRequested':
      return vi
        ? `${event.author} nhờ anh review PR: ${event.title}`
        : `${event.author} asked you to review PR: ${event.title}`
    default:
      return null
  }
}

function deployText(event: NoticeEvent, vi: boolean): string | null {
  switch (event.type) {
    case 'devMerged':
      return vi
        ? `${event.key} đã merge vào development - Jira chuyển sang Deployed to Dev, rồi Ready to Test khi CI deploy xong.`
        : `${event.key} merged into development - Jira goes to Deployed to Dev, then Ready to Test once CI deployed.`
    case 'deployed':
      if (event.moved) {
        return vi
          ? `${event.key} đã lên dev - đã chuyển Ready to Test.`
          : `${event.key} is on dev now - moved to Ready to Test.`
      }
      return vi
        ? `${event.key} đã lên dev - chuyển Ready to Test?`
        : `${event.key} is on dev now - Ready to Test?`
    case 'deployFailed':
      return vi
        ? `${event.key}: deploy dev lỗi (${event.pipeline}).`
        : `${event.key}: dev deploy failed (${event.pipeline}).`
    default:
      return null
  }
}

// One sentence per event, the same meaning as the C# app's notices; branch is a label like "FE Portal dev".
export function noticeText(event: NoticeEvent, language: 'en' | 'vi'): string {
  const vi = language === 'vi'
  const known = prText(event, vi) ?? deployText(event, vi)
  if (known !== null) {
    return known
  }
  switch (event.type) {
    case 'claudeWait':
      return `${event.subject}: ${waitSentence(event.wait, vi)}`
    case 'movedToReadyToTest':
      return vi ? `${event.key} đã chuyển sang Ready to Test.` : `${event.key} moved to Ready to Test.`
    case 'alreadyPastReadyToTest':
      return vi
        ? `${event.key} đã ở hoặc qua Ready to Test.`
        : `${event.key} is already at or past Ready to Test.`
    case 'ticketMissing':
      return vi ? `Không tìm thấy ${event.key} trên Jira.` : `${event.key} was not found in Jira.`
    case 'transitionFailed':
      return vi
        ? `${event.key}: không chuyển được sang ${event.status} (xem log).`
        : `${event.key}: could not move to ${event.status} (see log).`
    case 'suggestionsUrgent':
      return vi
        ? `Có ticket gấp để nhận: ${event.keys.join(', ')}`
        : `Urgent tickets to take: ${event.keys.join(', ')}`
    case 'teamsMessage':
      if (event.mention) {
        return vi
          ? `${event.sender} nhắc đến anh trong ${event.key} (${event.title}).`
          : `${event.sender} mentioned you in ${event.key} (${event.title}).`
      }
      return vi
        ? `${event.sender} nhắn trong ${event.key} (${event.title}).`
        : `${event.sender} wrote in ${event.key} (${event.title}).`
    default:
      return ''
  }
}
