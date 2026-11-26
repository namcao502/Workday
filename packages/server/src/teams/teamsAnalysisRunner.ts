// Runs one analysis at a time per conversation: the prompt goes to the ticket's Claude session as a task file, and the
// answer is looked for in that session's replies (matched by request id) whenever the page asks for the status.
import { randomBytes } from 'node:crypto'
import type { AppError, TeamsAnalysisView, TeamsThread } from '@workday/core'
import {
  analysisFromReply,
  analysisLine,
  analysisPath,
  ANALYSIS_TIMEOUT_MS,
  buildAnalysisPrompt,
  saveAnalysis,
  savedAnalysis,
  type StoredAnalysis,
} from './teamsAnalysis.js'
import { taskStamp, writeTaskFile, type PromptOutcome } from './teamsHandOff.js'

export interface AnalysisRunnerDeps {
  readonly workspace: {
    promptState(name: string): PromptOutcome
    prompt(name: string, text: string, quiet?: boolean): PromptOutcome
    assistantTexts(name: string): readonly string[] // newest last
    isWorking(name: string): boolean // a turn is running or queued
    // Running, no turn and no open question, and active within the hour, so its prompt cache is still warm.
    isIdleAndWarm(name: string): boolean
  }
  readonly tmpDir: string
  readonly now: () => Date
  readonly timeZone: () => string
  readonly devRepoPath: () => string | null
  readonly logError: (message: string, error: unknown) => void
}

interface Request {
  readonly id: string
  readonly session: string
  readonly lastMessageId: string
  readonly startedAt: number
}

export interface StartInput {
  readonly ticketKey: string
  readonly summary: string | null
  readonly thread: TeamsThread
  readonly myId: string
  readonly mainPoint: string | null
  readonly session: string
}

export type StartOutcome = { readonly ok: true } | { readonly ok: false; readonly error: AppError }

function refusal(outcome: PromptOutcome): AppError {
  if (outcome === 'notFound') {
    return { code: 'sessionNotFound' }
  }
  return { code: outcome === 'waiting' ? 'claudeWaiting' : 'claudeNotRunning' }
}

const MESSAGE_NUMBER = /^\d+$/

// Teams message ids grow with time; a read that returned only the thread root names an older one, so an
// analysis is stale only for a newer message. Ids that are not numbers compare by equality.
function isNewer(lastMessageId: string, analyzedId: string): boolean {
  if (MESSAGE_NUMBER.test(lastMessageId) && MESSAGE_NUMBER.test(analyzedId)) {
    return BigInt(lastMessageId) > BigInt(analyzedId)
  }
  return lastMessageId !== analyzedId
}

export class TeamsAnalysisRunner {
  private readonly requests = new Map<string, Request>()
  private readonly kept = new Map<string, StoredAnalysis>() // when there is no dev repo to save into
  private readonly failed = new Map<string, string>() // conversation -> the last message a run failed on
  private readonly autoStarted = new Map<string, string>() // conversation -> the last message it auto-started for

  constructor(private readonly deps: AnalysisRunnerDeps) {}

  private requestKey(ticketKey: string, conversationId: string): string {
    return `${ticketKey}|${conversationId}`
  }

  // A new run replaces the conversation's request, so the older one's answer no longer matches.
  async start(input: StartInput): Promise<StartOutcome> {
    const { ticketKey, thread, session } = input
    const ready = this.deps.workspace.promptState(session)
    if (ready !== 'sent') {
      return { ok: false, error: refusal(ready) }
    }
    const requestId = randomBytes(4).toString('hex')
    const lastMessageId = thread.messages.at(-1)?.id ?? ''
    const text = buildAnalysisPrompt({
      ticketKey,
      summary: input.summary,
      thread,
      myId: input.myId,
      mainPoint: input.mainPoint,
      requestId,
      timeZone: this.deps.timeZone(),
    })
    const path = await writeTaskFile(
      this.deps,
      `${ticketKey}-analysis-${taskStamp(this.deps.now())}.md`,
      text,
    )
    // Quiet: the analysis shows in the Teams panel, so its finish is no news.
    const sent = this.deps.workspace.prompt(session, analysisLine(path), true)
    if (sent !== 'sent') {
      return { ok: false, error: refusal(sent) }
    }
    this.requests.set(this.requestKey(ticketKey, thread.conversationId), {
      id: requestId,
      session,
      lastMessageId,
      startedAt: this.deps.now().getTime(),
    })
    return { ok: true }
  }

  // Collects a finished answer first, so the first status after Claude replied already shows it.
  async status(
    ticketKey: string,
    conversationId: string,
    lastMessageId: string,
  ): Promise<TeamsAnalysisView> {
    const key = this.requestKey(ticketKey, conversationId)
    const request = this.requests.get(key)
    if (request !== undefined) {
      const answered = await this.collect(ticketKey, conversationId, request)
      const timedOut = this.deps.now().getTime() - request.startedAt >= ANALYSIS_TIMEOUT_MS
      if (answered) {
        this.requests.delete(key)
      } else if (this.deps.workspace.isWorking(request.session) && !timedOut) {
        return { kind: 'running' }
      } else {
        // The turn ended without the answer (an API error such as a 401, or Claude stopped): Analyze may run again.
        this.requests.delete(key)
        this.failed.set(key, request.lastMessageId)
        return { kind: 'failed' }
      }
    }
    const stored = this.stored(ticketKey, conversationId)
    return stored === null
      ? { kind: 'none' }
      : {
          kind: 'done',
          analysis: stored.analysis,
          stale: isNewer(lastMessageId, stored.lastMessageId),
        }
  }

  // Port of the WPF unasked analysis: a message with no current analysis goes to Claude by itself while it is idle
  // and warm (a cold session reloads its whole conversation). A message a run failed on waits for Analyze.
  // True once per last message: the caller starts the run, and a second ask for it is a loop (MDP-9998 sent 119).
  claimAutoStart(
    view: TeamsAnalysisView,
    ticketKey: string,
    conversationId: string,
    lastMessageId: string,
    session: string,
  ): boolean {
    const key = this.requestKey(ticketKey, conversationId)
    const isDue = view.kind === 'none' || (view.kind === 'done' && view.stale)
    const claimed =
      isDue &&
      this.failed.get(key) !== lastMessageId &&
      this.autoStarted.get(key) !== lastMessageId &&
      this.deps.workspace.isIdleAndWarm(session)
    if (claimed) {
      this.autoStarted.set(key, lastMessageId)
    }
    return claimed
  }

  forgetTicket(ticketKey: string): void {
    for (const map of [this.requests, this.failed, this.autoStarted]) {
      for (const key of [...map.keys()]) {
        if (key.startsWith(`${ticketKey}|`)) {
          map.delete(key)
        }
      }
    }
  }

  private stored(ticketKey: string, conversationId: string): StoredAnalysis | null {
    const kept = this.kept.get(this.requestKey(ticketKey, conversationId))
    const repo = this.deps.devRepoPath()
    if (kept !== undefined || repo === null) {
      return kept ?? null
    }
    return savedAnalysis(analysisPath(repo, ticketKey), conversationId)
  }

  private async collect(
    ticketKey: string,
    conversationId: string,
    request: Request,
  ): Promise<boolean> {
    const texts = this.deps.workspace.assistantTexts(request.session)
    for (const text of [...texts].reverse()) {
      const found = analysisFromReply(text)
      if (found?.requestId === request.id) {
        const stored: StoredAnalysis = {
          lastMessageId: request.lastMessageId,
          analyzedAt: this.deps.now().toISOString(),
          analysis: found.analysis,
        }
        const repo = this.deps.devRepoPath()
        if (repo === null) {
          this.kept.set(this.requestKey(ticketKey, conversationId), stored)
        } else {
          try {
            await saveAnalysis(analysisPath(repo, ticketKey), conversationId, stored)
          } catch (error: unknown) {
            this.deps.logError('Saving the Teams analysis failed', error)
            this.kept.set(this.requestKey(ticketKey, conversationId), stored)
          }
        }
        return true
      }
    }
    return false
  }
}
