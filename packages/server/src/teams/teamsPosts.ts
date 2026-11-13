// Keeps each watched channel's ticket posts indexed: the newest pages once a minute, then a bounded deep scan.
import {
  emptyChannelIndex,
  withPosts,
  type TeamsChannelIndex,
  type TeamsChat,
  type TeamsMessage,
  type TeamsMessagePage,
  type TeamsPostIndex,
} from '@workday/core'
import { TeamsHttpError } from './teamsHttp.js'

export const MAX_PAGES_PER_READ = 15
export const DEEP_SCAN_PAGE_LIMIT = 40
const MIN_NEW_PAGES_PER_SYNC = 3
const SYNC_INTERVAL_MS = 60 * 1000
const SYNC_OVERLAP_MS = 24 * 60 * 60 * 1000
const UNEXPECTED_HOST = 'unexpected host'

export interface TeamsPostSyncDeps {
  readonly initial: TeamsPostIndex
  readonly save: (index: TeamsPostIndex) => Promise<void>
  readonly now: () => Date
  // Page one of every sync, so the people list learns the channel's senders.
  readonly onFirstPage?: (messages: readonly TeamsMessage[], myId: string) => Promise<void>
  readonly log?: (message: string) => void
}

type ChannelChange = (index: TeamsChannelIndex) => TeamsChannelIndex

function isStatus(error: unknown, statuses: readonly number[]): boolean {
  return error instanceof TeamsHttpError && statuses.includes(error.status)
}

// A refused saved link (4xx) or one on another chat host (Teams moved the region) would fail every read until reset.
function isStaleLink(error: unknown): boolean {
  if (error instanceof TeamsHttpError) {
    return error.status >= 400 && error.status < 500
  }
  return error instanceof Error && error.message.includes(UNEXPECTED_HOST)
}

export class TeamsPostSync {
  private index: TeamsPostIndex
  private writes: Promise<unknown> = Promise.resolve()
  private readonly channelLocks = new Map<string, Promise<unknown>>()
  private readonly log: (message: string) => void

  constructor(private readonly deps: TeamsPostSyncDeps) {
    this.index = deps.initial
    this.log = deps.log ?? console.info
  }

  get(channelId: string): TeamsChannelIndex {
    return Object.hasOwn(this.index, channelId)
      ? (this.index[channelId] ?? emptyChannelIndex())
      : emptyChannelIndex()
  }

  // Saved before memory changes, one write at a time; an unchanged index is not written.
  update(channelId: string, change: ChannelChange): Promise<void> {
    const run = this.writes.then(async () => {
      const current = this.get(channelId)
      const next = change(current)
      if (next === current) {
        return
      }
      const nextIndex = { ...this.index, [channelId]: next }
      await this.deps.save(nextIndex)
      this.index = nextIndex
    })
    this.writes = run.catch(() => undefined)
    return run
  }

  // Syncs the channels in order on one page budget; returns those after the first it may not read (403 / 404).
  async syncChannels(
    chat: TeamsChat,
    channelIds: readonly string[],
    myId: string,
  ): Promise<readonly string[]> {
    const unreadable: string[] = []
    let budget = MAX_PAGES_PER_READ
    for (const channelId of channelIds) {
      try {
        budget = await this.locked(channelId, () => this.syncChannel(chat, channelId, myId, budget))
      } catch (error: unknown) {
        if (channelId === channelIds[0] || !isStatus(error, [403, 404])) {
          throw error
        }
        this.log('[teams] skipped a watched channel it cannot read')
        unreadable.push(channelId)
      }
    }
    return unreadable
  }

  private locked<Result>(channelId: string, work: () => Promise<Result>): Promise<Result> {
    const previous = this.channelLocks.get(channelId) ?? Promise.resolve()
    const run = previous.then(work)
    this.channelLocks.set(
      channelId,
      run.catch(() => undefined),
    )
    return run
  }

  private async syncChannel(
    chat: TeamsChat,
    channelId: string,
    myId: string,
    budget: number,
  ): Promise<number> {
    if (budget <= 0) {
      return budget
    }
    // Read under the lock: a sync that just finished moved syncedAt and the cursor.
    const index = this.get(channelId)
    const syncedAt = index.syncedAt === null ? null : Date.parse(index.syncedAt)
    let left = budget
    let firstPage: TeamsMessagePage | null = null
    if (syncedAt === null || this.deps.now().getTime() - syncedAt >= SYNC_INTERVAL_MS) {
      ;({ left, firstPage } = await this.syncNewPages(chat, channelId, syncedAt, myId, left))
    }
    if (index.deepScanned || left <= 0) {
      return left
    }
    return this.continueDeepScan(chat, channelId, index, firstPage, myId, left)
  }

  private async indexPage(channelId: string, page: TeamsMessagePage, myId: string): Promise<void> {
    const now = this.deps.now().toISOString()
    await this.update(channelId, (current) => withPosts(current, page.messages, myId, now))
  }

  // Back to the last sync less a day, never before page three: pages one and two are ordered by last change.
  private async syncNewPages(
    chat: TeamsChat,
    channelId: string,
    syncedAt: number | null,
    myId: string,
    budget: number,
  ): Promise<{ readonly left: number; readonly firstPage: TeamsMessagePage | null }> {
    const startedAt = this.deps.now().toISOString()
    let left = budget
    let firstPage: TeamsMessagePage | null = null
    let link: string | null = null
    let pageCount = 0
    while (left > 0) {
      const page = await chat.channelPage(channelId, link)
      left -= 1
      pageCount += 1
      await this.indexPage(channelId, page, myId)
      if (pageCount === 1) {
        firstPage = page
        await this.deps.onFirstPage?.(page.messages, myId)
      }
      const newest = Math.max(...page.messages.map((message) => Date.parse(message.sentAt)))
      const reachedLastSync =
        syncedAt === null ||
        (pageCount >= MIN_NEW_PAGES_PER_SYNC &&
          page.messages.length !== 0 &&
          newest < syncedAt - SYNC_OVERLAP_MS)
      if (page.backwardLink === null || page.backwardLink === '' || reachedLastSync) {
        break
      }
      link = page.backwardLink
    }
    // Also when the budget ran out: else a long gap is read again on every read and the deep scan never runs.
    await this.update(channelId, (current) => ({ ...current, syncedAt: startedAt }))
    return { left, firstPage }
  }

  // Reads on from the saved cursor (page two when none) until the budget, the pages or the page limit run out.
  private async continueDeepScan(
    chat: TeamsChat,
    channelId: string,
    index: TeamsChannelIndex,
    firstPage: TeamsMessagePage | null,
    myId: string,
    budget: number,
  ): Promise<number> {
    let left = budget
    let resumesSavedLink = index.deepScanLink !== null
    let link = index.deepScanLink ?? firstPage?.backwardLink ?? null
    if (link === null && firstPage === null) {
      const pageOne = await chat.channelPage(channelId, null)
      left -= 1
      await this.indexPage(channelId, pageOne, myId)
      link = pageOne.backwardLink
    }
    let scanned = index.deepScanPages
    if (link === null || link === '' || scanned >= DEEP_SCAN_PAGE_LIMIT) {
      await this.update(channelId, (current) => ({
        ...current,
        deepScanned: true,
        deepScanLink: null,
      }))
      return left
    }
    while (left > 0 && link !== null && link !== '') {
      let page: TeamsMessagePage
      try {
        page = await chat.channelPage(channelId, link)
      } catch (error: unknown) {
        if (!resumesSavedLink || !isStaleLink(error)) {
          throw error
        }
        this.log('[teams] the saved deep scan link was refused; the scan starts over next time')
        await this.update(channelId, (current) => ({
          ...current,
          deepScanPages: 0,
          deepScanLink: null,
        }))
        return left
      }
      resumesSavedLink = false
      left -= 1
      scanned += 1
      const deepScanned =
        page.backwardLink === null || page.backwardLink === '' || scanned >= DEEP_SCAN_PAGE_LIMIT
      const nextLink = deepScanned ? null : page.backwardLink
      const now = this.deps.now().toISOString()
      const pages = scanned
      // Saved after every page, so a timeout or restart goes on from here.
      await this.update(channelId, (current) => ({
        ...withPosts(current, page.messages, myId, now),
        deepScanned,
        deepScanPages: pages,
        deepScanLink: nextLink,
      }))
      link = nextLink
    }
    return left
  }
}
