import {
  addNotice,
  markAllRead,
  markRead,
  markReadAt,
  noticeChannels,
  noticeText,
  NOTICE_CAP,
  removeExpired,
  type Notice,
  type NoticeEvent,
  type NoticePrefs,
  type NoticesView,
  type NoticeTarget,
  type NoticeTone,
  type NoticeTopic,
  type RemoteArea,
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
  readonly push: (area: RemoteArea, message: PushMessage) => Promise<void>
  readonly settings: () => { readonly prefs: NoticePrefs; readonly language: 'en' | 'vi' }
  readonly logError: (message: string, error: unknown) => void
}

const BOARD_URL = '/#/board'

// The phone cannot open the Workspace, so a workspace notice opens the board there.
function pushUrl(target: NoticeTarget | null): string {
  return target !== null && target.kind === 'url' ? target.url : BOARD_URL
}

export class NoticeService {
  private notices: readonly Notice[]
  private nextId: number
  private queue: Promise<unknown> = Promise.resolve()

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
    return notice
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
    const { prefs, language } = this.deps.settings()
    if (!noticeChannels(notice.topic, prefs).phone) {
      return
    }
    const message: PushMessage = {
      title: 'Workday',
      body: noticeText(notice.event, language),
      url: pushUrl(notice.target),
      tag: `notice-${String(notice.id)}`,
    }
    this.deps.push('board', message).catch((error: unknown) => {
      this.deps.logError('Pushing a notice failed', error)
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
