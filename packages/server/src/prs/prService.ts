import {
  BUILD_READ_SLACK_MS,
  mergesToWatch,
  shouldNotifyDeploy,
  ticketState,
  type BoardState,
  type CommentAlert,
  type DevDeploy,
  type PrReviewRequest,
  type PrTracking,
  type PullRequests,
  type ReadyToTestOutcome,
  type StatusFlow,
  type TicketTracker,
} from '@workday/core'
import type { EventSink } from '../events.js'
import type { RecordJob } from '../schedules/jobRuns.js'
import type { NoticeInput } from '../notices/noticeService.js'
import { commentsPlace, deployNotice } from './prNotices.js'
import { applyPass, readPrPass, sameDeploy, sameEntries, sameState, type PrPass } from './prPass.js'
import { ReadyToTestWalker } from './readyToTestWalker.js'

export interface PrState {
  readonly tracking: PrTracking
  readonly baselineDone: boolean
  readonly reviews: Readonly<Record<string, PrReviewRequest>> // "<repo>|<id>"
  readonly reviewBaselineDone: boolean
  readonly commentAlerts: Readonly<Record<string, CommentAlert>>
  readonly deploys: Readonly<Record<string, DevDeploy>>
}

export interface PrSettings {
  readonly pullRequests: PullRequests | null
  readonly tracker: TicketTracker | null
  readonly flow: StatusFlow
  readonly repoLabels: Readonly<Record<string, string>>
}

export interface PrServiceDeps {
  readonly initialState: PrState
  readonly save: (state: PrState) => Promise<void>
  readonly events: EventSink
  readonly notices: {
    add(input: NoticeInput): Promise<unknown>
    markReadAt(place: string): Promise<void>
  }
  readonly board: { snapshot(): BoardState; refreshTicket(key: string): Promise<void> }
  readonly settings: PrSettings
  readonly now?: () => Date
  readonly recordJob?: RecordJob
  readonly logError?: (message: string, error: unknown) => void
}

export interface PrCheckRun {
  readonly at: string
  readonly ok: boolean
}

function logToConsole(message: string, error: unknown): void {
  console.error(message, error)
}

export class PrService {
  private current: PrState
  private settings: PrSettings
  private lastRun: PrCheckRun | null = null
  private queue: Promise<void> = Promise.resolve()
  private running: { readonly client: PullRequests; readonly done: Promise<void> } | null = null
  private readonly walker: ReadyToTestWalker
  private readonly now: () => Date
  private readonly logError: (message: string, error: unknown) => void

  constructor(private readonly deps: PrServiceDeps) {
    this.current = deps.initialState
    this.settings = deps.settings
    this.now = deps.now ?? (() => new Date())
    this.logError = deps.logError ?? logToConsole
    this.walker = new ReadyToTestWalker({
      settings: () => ({
        tracker: this.settings.tracker,
        path: this.settings.flow.readyToTestPath,
      }),
      notices: deps.notices,
      board: deps.board,
      logError: this.logError,
    })
  }

  configure(settings: PrSettings): void {
    this.settings = settings
  }

  state(): PrState {
    return this.current
  }

  lastCheck(): PrCheckRun | null {
    return this.lastRun
  }

  // A check asked for while one runs on the same client shares it, so Azure DevOps is read once.
  check(): Promise<void> {
    const client = this.settings.pullRequests
    if (client === null) {
      return Promise.resolve()
    }
    if (this.running?.client === client) {
      return this.running.done
    }
    const running = {
      client,
      done: this.runCheck(client).finally(() => {
        if (this.running === running) {
          this.running = null
        }
      }),
    }
    this.running = running
    return running.done
  }

  readyToTest(key: string): Promise<ReadyToTestOutcome> {
    return this.walker.walk(key)
  }

  async markCommentsSeen(key: string): Promise<void> {
    await this.enqueue(async () => {
      if (Object.hasOwn(this.current.commentAlerts, key)) {
        const commentAlerts = Object.fromEntries(
          Object.entries(this.current.commentAlerts).filter(([alertKey]) => alertKey !== key),
        )
        await this.commit({ ...this.current, commentAlerts })
      }
    })
    await this.deps.notices.markReadAt(commentsPlace(key))
  }

  async hideReview(reviewKey: string): Promise<void> {
    await this.enqueue(async () => {
      const review = this.current.reviews[reviewKey]
      if (review !== undefined && !review.seen) {
        const reviews = { ...this.current.reviews, [reviewKey]: { ...review, seen: true } }
        await this.commit({ ...this.current, reviews })
      }
    })
  }

  // Azure DevOps is read outside the queue; each result is applied to the state current then.
  private async runCheck(client: PullRequests): Promise<void> {
    const startedAt = this.now()
    let ok = false
    try {
      const pass = await readPrPass(
        client,
        this.deps.board.snapshot(),
        this.current.tracking,
        this.logError,
      )
      const requests = await this.readReviews(client)
      const notices = await this.enqueue(() => this.applyPrs(client, pass, requests))
      if (notices === null) {
        return
      }
      this.notifyAll(notices)
      await this.checkDeploys(client)
      ok = pass.reachable
    } catch (error: unknown) {
      this.logError('PR check failed', error)
    }
    await this.enqueue(() => {
      if (this.settings.pullRequests === client) {
        const endedAt = this.now().toISOString()
        this.lastRun = { at: endedAt, ok }
        this.deps.recordJob?.('prCheck', {
          startedAt: startedAt.toISOString(),
          endedAt,
          ok,
          summary: null,
        })
        this.deps.events.broadcast({ type: 'work.changed' })
      }
    })
  }

  // A failed read keeps the saved list and never fails the PR check.
  private async readReviews(client: PullRequests): Promise<readonly PrReviewRequest[] | null> {
    try {
      return await client.reviewRequests()
    } catch (error: unknown) {
      this.logError('Reading the review requests failed', error)
      return null
    }
  }

  // Null when the client was replaced mid-check.
  private async applyPrs(
    client: PullRequests,
    pass: PrPass,
    requests: readonly PrReviewRequest[] | null,
  ): Promise<readonly NoticeInput[] | null> {
    if (this.settings.pullRequests !== client) {
      return null
    }
    const applied = applyPass(this.current, pass, requests, {
      board: this.deps.board.snapshot(),
      path: this.settings.flow.readyToTestPath,
      repoLabels: this.settings.repoLabels,
      at: this.now().toISOString(),
    })
    await this.commit(applied.state)
    return applied.notices
  }

  // One read of the dev pipelines' runs tells which merges reached dev. A failed read keeps the saved states.
  private async checkDeploys(client: PullRequests): Promise<void> {
    try {
      const board = this.deps.board.snapshot()
      const statusByTicket: Record<string, string | null> = {}
      for (const ticket of [...Object.values(board.inProgress), ...Object.values(board.done)]) {
        statusByTicket[ticket.key] = ticket.status
      }
      const now = this.now().toISOString()
      const path = this.settings.flow.readyToTestPath
      const watched = Object.entries(
        mergesToWatch(this.current.tracking, statusByTicket, path, now),
      )
      const firstMerge = Math.min(
        ...watched.flatMap(([, merges]) => merges.map((merge) => Date.parse(merge.mergedAt))),
      )
      const builds =
        watched.length === 0
          ? []
          : await client.devDeployBuilds(new Date(firstMerge - BUILD_READ_SLACK_MS).toISOString())
      const results: { key: string; deploy: DevDeploy; moved: boolean }[] = []
      for (const [key, merges] of watched) {
        const deploy = ticketState(merges, builds, now)
        results.push({ key, deploy, moved: await this.walker.auto(key, deploy) })
      }
      const notices = await this.enqueue(async () => {
        if (this.settings.pullRequests !== client) {
          return []
        }
        const previous = this.current.deploys
        const deploys = Object.fromEntries(results.map(({ key, deploy }) => [key, deploy]))
        await this.commit({
          ...this.current,
          deploys: sameEntries(previous, deploys, sameDeploy) ? previous : deploys,
        })
        return results
          .filter(({ key, deploy }) => shouldNotifyDeploy(previous[key] ?? null, deploy, now))
          .map(({ key, deploy, moved }) => deployNotice(key, deploy, moved))
      })
      this.notifyAll(notices)
    } catch (error: unknown) {
      this.logError('Checking the dev deploys failed', error)
    }
  }

  private notifyAll(notices: readonly NoticeInput[]): void {
    for (const notice of notices) {
      this.deps.notices.add(notice).catch((error: unknown) => {
        this.logError('Adding a PR notice failed', error)
      })
    }
  }

  // Runs after every earlier task; a failed task rejects its own caller but never the chain.
  private enqueue<Result>(task: () => Result | Promise<Result>): Promise<Result> {
    const run = this.queue.then(task)
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  // Saved before it is kept, so a failed save leaves the state as it was.
  private async commit(next: PrState): Promise<void> {
    if (sameState(next, this.current)) {
      return
    }
    await this.deps.save(next)
    this.current = next
    this.deps.events.broadcast({ type: 'work.changed' })
  }
}
