import {
  autoSteps,
  stepsToReadyToTest,
  type DevDeploy,
  type ReadyToTestOutcome,
  type TicketTracker,
} from '@workday/core'
import type { NoticeInput } from '../notices/noticeService.js'

export interface WalkSettings {
  readonly tracker: TicketTracker | null
  readonly path: readonly string[]
}

export interface ReadyToTestWalkerDeps {
  readonly settings: () => WalkSettings
  readonly notices: { add(input: NoticeInput): Promise<unknown> }
  readonly board: { refreshTicket(key: string): Promise<void> }
  readonly logError: (message: string, error: unknown) => void
}

function jiraNotice(
  tone: NoticeInput['tone'],
  event: NoticeInput['event'],
  key: string,
): NoticeInput {
  return { topic: 'jira', tone, event, target: { kind: 'board', key }, place: 'board' }
}

export class ReadyToTestWalker {
  private readonly walking = new Set<string>()
  // "<KEY>|<step>" whose automatic move failed: noticed once for the life of the process.
  private readonly autoFailures = new Set<string>()

  constructor(private readonly deps: ReadyToTestWalkerDeps) {}

  // The user's click. Steps come from Jira's live status, so a ticket is never walked backward.
  async walk(key: string): Promise<ReadyToTestOutcome> {
    const { tracker, path } = this.deps.settings()
    if (this.walking.has(key)) {
      return { status: 'busy' }
    }
    if (tracker === null) {
      return { status: 'notFound' }
    }
    this.walking.add(key)
    // A Jira error before any step names Ready to Test itself (the path's last step).
    const attempt = { step: path.at(-1) ?? '' }
    try {
      const outcome = await this.walkSteps(tracker, key, path, attempt)
      this.notify(this.outcomeNotice(key, outcome))
      return outcome
    } catch (error: unknown) {
      this.deps.logError(`Ready to Test ${key} failed`, error)
      this.notify(this.outcomeNotice(key, { status: 'failed', step: attempt.step }))
      throw error
    } finally {
      await this.refresh(key)
    }
  }

  // After the dev merge: the last step waits for the deploy. True once the ticket stands there and dev is deployed.
  async auto(key: string, deploy: DevDeploy): Promise<boolean> {
    const { tracker, path } = this.deps.settings()
    if (tracker === null || this.walking.has(key)) {
      return false
    }
    this.walking.add(key)
    let walked = false
    try {
      const live = await tracker.getTicket(key)
      const steps = autoSteps(live?.status ?? null, path, deploy.state)
      if (live === null || steps.length === 0) {
        const lastStep = path.at(-1)
        return (
          live !== null &&
          deploy.state === 'deployed' &&
          lastStep !== undefined &&
          live.status?.toLowerCase() === lastStep.toLowerCase()
        )
      }
      walked = true
      for (const step of steps) {
        if (await tracker.transition(key, step)) {
          continue
        }
        this.deps.logError(`${key}: no transition to ${step} after the dev merge`, null)
        if (!this.autoFailures.has(`${key}|${step}`)) {
          this.autoFailures.add(`${key}|${step}`)
          this.notify(jiraNotice('error', { type: 'transitionFailed', key, status: step }, key))
        }
        return false
      }
      return deploy.state === 'deployed'
    } catch (error: unknown) {
      this.deps.logError(`${key}: moving Jira after the dev merge failed`, error)
      return false
    } finally {
      if (walked) {
        await this.refresh(key)
      }
      this.walking.delete(key)
    }
  }

  private async walkSteps(
    tracker: TicketTracker,
    key: string,
    path: readonly string[],
    attempt: { step: string },
  ): Promise<ReadyToTestOutcome> {
    const live = await tracker.getTicket(key)
    if (live === null) {
      return { status: 'notFound' }
    }
    const steps = stepsToReadyToTest(live.status, path)
    if (steps.length === 0) {
      return { status: 'alreadyPast' }
    }
    for (const step of steps) {
      attempt.step = step
      if (!(await tracker.transition(key, step))) {
        this.deps.logError(`Ready to Test ${key}: no transition to ${step}`, null)
        return { status: 'failed', step }
      }
    }
    return { status: 'moved' }
  }

  private outcomeNotice(key: string, outcome: ReadyToTestOutcome): NoticeInput {
    switch (outcome.status) {
      case 'moved':
        return jiraNotice('success', { type: 'movedToReadyToTest', key }, key)
      case 'alreadyPast':
        return jiraNotice('info', { type: 'alreadyPastReadyToTest', key }, key)
      case 'failed':
        return jiraNotice('error', { type: 'transitionFailed', key, status: outcome.step }, key)
      default:
        return jiraNotice('error', { type: 'ticketMissing', key }, key)
    }
  }

  // Re-read even after a partial walk, so the row shows Jira's real status; the key stays busy until then.
  private async refresh(key: string): Promise<void> {
    try {
      await this.deps.board.refreshTicket(key)
    } finally {
      this.walking.delete(key)
    }
  }

  private notify(input: NoticeInput): void {
    this.deps.notices.add(input).catch((error: unknown) => {
      this.deps.logError('Adding a Ready to Test notice failed', error)
    })
  }
}
