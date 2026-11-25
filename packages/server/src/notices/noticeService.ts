import {
  addNotice,
  isAtPc,
  markAllRead,
  markRead,
  markReadAt,
  noticeChannels,
  noticeText,
  NOTICE_CAP,
  removeExpired,
  type Notice,
  type DesktopPresence,
  type NoticeEvent,
  type NoticePrefs,
  type NoticeRouting,
  type NoticesView,
  type NoticeTarget,
  type NoticeTone,
  type NoticeTopic,
} from '@workday/core'
import type { EventSink } from '../events.js'
import type { PushMessage } from '../remote/pushService.js'

export interface NoticeInput {
  readonly topic: NoticeTopic
  readonly tone: NoticeTone
  readonly event: NoticeEvent
  readonly target: NoticeTarget | null
  readonly place: string | null // "session:<name>", "pr-comments:<KEY>", "board"
}

export interface NoticeServiceDeps {
  readonly initial: readonly Notice[]
  readonly save: (notices: readonly Notice[]) => Promise<void>
  readonly events: EventSink
  readonly now: () => Date
  readonly push: (message: PushMessage) => Promise<void>
  readonly pushLocal: (message: PushMessage) => Promise<void> // this PC's browser, window closed
  readonly settings: () => {
    readonly prefs: NoticePrefs
    readonly language: 'en' | 'vi'
    readonly routing: NoticeRouting
  }
  readonly logError: (message: string, error: unknown) => void
}

const BOARD_URL = '/#/board'
const MINUTE_MS = 60_000

// The phone cannot open the Workspace, so a workspace notice opens the board there.
function pushUrl(target: NoticeTarget | null): string {
  if (target?.kind === 'ticketUpdate') {
    return ticketUpdateUrl(target.key)
  }
  return target !== null && target.kind === 'url' ? target.url : BOARD_URL
}

// The tickets page opens the old / new comparison of the key in the query.
function ticketUpdateUrl(key: string): string {
  return `/#/tickets?update=${encodeURIComponent(key)}`
}

// Local push opens the PC's own page, so a workspace or Teams notice keeps its full target.
function localUrl(target: NoticeTarget | null): string {
  if (target === null) {
    return '/'
  }
  switch (target.kind) {
    case 'url':
      return target.url
    case 'schedules':
      return '/#/schedules'
    case 'timesheet':
      return '/#/timesheet'
    case 'board':
      return '/#/tickets'
    case 'ticketUpdate':
      return ticketUpdateUrl(target.key)
    case 'workspace':
      return `/#/workspace/${encodeURIComponent(target.tab)}/${encodeURIComponent(target.session)}`
    case 'teams':
      return `/#/workspace/${encodeURIComponent(target.key)}?teams=${encodeURIComponent(target.conversationId)}`
  }
}

export class NoticeService {
  private notices: readonly Notice[]
  private nextId: number
  private queue: Promise<unknown> = Promise.resolve()
  private presence: DesktopPresence | null = null

  constructor(private readonly deps: NoticeServiceDeps) {
    // Whatever came back from a restart counts as seen.
    const kept = removeExpired(deps.initial, deps.now().toISOString())
    this.notices = markAllRead(kept).slice(-NOTICE_CAP)
    this.nextId = this.notices.reduce((max, notice) => Math.max(max, notice.id), 0) + 1
  }

  view(): NoticesView {
    const notices = removeExpired(this.notices, this.deps.now().toISOString())
    const { prefs } = this.deps.settings()
    return { notices, unread: notices.filter((notice) => !notice.read).length, prefs }
  }

  // Never fails: a failed save is logged and the notice stays in memory.
  async add(input: NoticeInput): Promise<Notice> {
    const notice = await this.enqueue(async () => {
      const now = this.deps.now().toISOString()
      const added: Notice = { ...input, id: this.nextId, at: now, read: false }
      this.nextId += 1
      await this.commit(addNotice(removeExpired(this.notices, now), added))
      return added
    })
    this.pushToPhone(notice)
    this.pushToDesktop(notice)
    return notice
  }

  // The desktop app's report of Windows input and lock state.
  reportPresence(idleSeconds: number, locked: boolean): void {
    this.presence = { idleSeconds, locked, at: this.deps.now().toISOString() }
  }

  // True while the phone should wait: the user is at the PC and asked for Teams-style routing.
  holdsPhone(): boolean {
    const { routing } = this.deps.settings()
    return (
      routing.phoneOnlyWhenAway &&
      isAtPc(this.presence, routing, this.deps.now().toISOString())
    )
  }

  markRead(id: number): Promise<void> {
    return this.enqueue(() => this.commit(markRead(this.notices, id)))
  }

  markReadAt(place: string): Promise<void> {
    return this.enqueue(() => this.commit(markReadAt(this.notices, place)))
  }

  markAllRead(): Promise<void> {
    return this.enqueue(() => this.commit(markAllRead(this.notices)))
  }

  private pushToPhone(notice: Notice): void {
    const { prefs, language, routing } = this.deps.settings()
    if (!noticeChannels(notice.topic, prefs).phone) {
      return
    }
    const message: PushMessage = {
      title: 'Workday',
      body: noticeText(notice.event, language),
      url: pushUrl(notice.target),
      tag: `notice-${String(notice.id)}`,
    }
    if (!this.holdsPhone()) {
      this.sendToPhone(message)
      return
    }
    if (routing.fallbackMinutes === 0) {
      return
    }
    // Like Teams: what the user has not read on the PC by then reaches the phone.
    const timer = setTimeout(() => {
      const current = this.notices.find((candidate) => candidate.id === notice.id)
      if (current !== undefined && !current.read) {
        this.sendToPhone(message)
      }
    }, routing.fallbackMinutes * MINUTE_MS)
    timer.unref()
  }

  private sendToPhone(message: PushMessage): void {
    this.deps.push(message).catch((error: unknown) => {
      this.deps.logError('Pushing a notice failed', error)
    })
  }

  private pushToDesktop(notice: Notice): void {
    const { prefs, language } = this.deps.settings()
    if (!noticeChannels(notice.topic, prefs).desktop) {
      return
    }
    const message: PushMessage = {
      title: 'Workday',
      body: noticeText(notice.event, language),
      url: localUrl(notice.target),
      tag: `notice-${String(notice.id)}`,
    }
    this.deps.pushLocal(message).catch((error: unknown) => {
      this.deps.logError('Pushing a notice locally failed', error)
    })
  }

  private enqueue<Result>(work: () => Promise<Result>): Promise<Result> {
    const run = this.queue.then(work)
    this.queue = run.catch(() => undefined)
    return run
  }

  // The bell never breaks its caller: a failed save is logged and memory still changes.
  private async commit(next: readonly Notice[]): Promise<void> {
    if (next === this.notices) {
      return
    }
    try {
      await this.deps.save(next)
    } catch (error: unknown) {
      this.deps.logError('Saving the notices failed', error)
    }
    this.notices = next
    this.deps.events.broadcast({ type: 'notices.changed' })
  }
}
