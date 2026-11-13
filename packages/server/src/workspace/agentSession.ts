import { statSync } from 'node:fs'
import {
  toChatRequest,
  toDecision,
  waitOfRequests,
  type AbortSignalLike,
  type AgentDecision,
  type AgentEvent,
  type AgentMode,
  type AgentSessionHandle,
  type AgentToolCall,
  type ChatAnswer,
  type ChatRequest,
  type ClaudeAgent,
} from '@workday/core'
import { WorkspaceStartError } from './workspaceStartError.js'

export interface SessionDirectory {
  readonly path: string
  readonly fallback: string | null // null: a missing path is an error (a ticket's worktree)
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export interface AgentSessionDeps {
  readonly name: string
  readonly agent: ClaudeAgent
  readonly directory: () => SessionDirectory // may throw WorkspaceStartError
  readonly resumeId: (cwd: string) => string | null // saved id whose transcript still exists
  readonly continueLatest: (cwd: string) => boolean // main ticket session with transcripts in the folder
  readonly mode: () => AgentMode // config default for a new process
  readonly onChange: () => void
  readonly onAttention: () => void // running / working / finished / wait changed
  readonly onSessionId: (cwd: string, sessionId: string) => void
}

export interface AgentSessionState {
  readonly running: boolean
  readonly working: boolean
  readonly finished: boolean // a turn ended since the user last looked
  readonly mode: AgentMode
  readonly model: string | null
  readonly sessionId: string | null
  readonly cwd: string | null
  readonly requests: readonly ChatRequest[]
}

interface PendingRequest {
  readonly request: ChatRequest
  readonly call: AgentToolCall
  readonly resolve: (decision: AgentDecision) => void
}

type Progress = Pick<AgentSessionState, 'running' | 'working' | 'finished'>

const SESSION_ENDED: AgentDecision = { kind: 'deny', message: 'Session ended.' }
const CANCELLED: AgentDecision = { kind: 'deny', message: 'Cancelled.' }

// One Claude process per tab, started lazily by the first prompt and restarted after it exits.
export class AgentSession {
  readonly name: string
  private handle: AgentSessionHandle | null = null
  private progress: Progress = { running: false, working: false, finished: false }
  private runningMode: AgentMode = 'default'
  private nextMode: AgentMode | null = null // set while stopped, used by the next start
  private model: string | null = null
  private sessionId: string | null = null
  private cwd: string | null = null
  private pending: readonly PendingRequest[] = []
  private disposed = false

  constructor(private readonly deps: AgentSessionDeps) {
    this.name = deps.name
  }

  get state(): AgentSessionState {
    return {
      ...this.progress,
      mode: this.handle === null ? (this.nextMode ?? this.deps.mode()) : this.runningMode,
      model: this.model,
      sessionId: this.sessionId,
      cwd: this.cwd,
      requests: this.pending.map((item) => item.request),
    }
  }

  send(text: string): void {
    if (this.disposed) {
      throw new WorkspaceStartError('sessionNotFound')
    }
    const handle = this.handle ?? this.start()
    handle.send(text)
    this.update({ running: true, working: true, finished: false })
  }

  answer(requestId: string, answer: ChatAnswer): 'ok' | 'notFound' | 'invalid' {
    const item = this.pending.find((candidate) => candidate.request.id === requestId)
    if (item === undefined) {
      return 'notFound'
    }
    const decision = toDecision(item.request, item.call, answer)
    if (decision === null) {
      return 'invalid'
    }
    this.settle(requestId, decision)
    return 'ok'
  }

  async interrupt(): Promise<void> {
    await this.handle?.interrupt()
  }

  async setMode(mode: AgentMode): Promise<void> {
    const handle = this.handle
    if (handle === null) {
      this.nextMode = mode
      this.deps.onChange()
      return
    }
    await handle.setMode(mode)
    if (handle === this.handle) {
      this.runningMode = mode
      this.deps.onChange()
    }
  }

  seen(): void {
    this.update({ finished: false })
  }

  dispose(): void {
    this.disposed = true
    const handle = this.handle
    this.handle = null
    handle?.close()
    this.end()
  }

  private start(): AgentSessionHandle {
    const { path, fallback } = this.deps.directory()
    let cwd = path
    if (!isDirectory(path)) {
      if (fallback === null) {
        throw new WorkspaceStartError('worktreeMissing')
      }
      cwd = fallback
    }
    const resume = this.deps.resumeId(cwd)
    const mode = this.nextMode ?? this.deps.mode()
    let handle: AgentSessionHandle | null = null
    // Calls from a handle replaced by a restart (or disposed) are ignored.
    const isCurrent = (): boolean => handle !== null && handle === this.handle
    handle = this.deps.agent.start({
      cwd,
      mode,
      resume,
      continueLatest: resume === null && this.deps.continueLatest(cwd),
      onEvent: (event) => {
        if (isCurrent()) {
          this.onEvent(cwd, event)
        }
      },
      onToolCall: (call, signal) =>
        isCurrent() ? this.onToolCall(call, signal) : Promise.resolve(SESSION_ENDED),
    })
    this.handle = handle
    this.runningMode = mode
    this.nextMode = null
    this.cwd = cwd
    return handle
  }

  private onEvent(cwd: string, event: AgentEvent): void {
    switch (event.type) {
      case 'init':
        this.sessionId = event.sessionId
        this.model = event.model
        this.runningMode = event.mode
        this.deps.onSessionId(cwd, event.sessionId)
        this.deps.onChange()
        return
      case 'mode':
        this.runningMode = event.mode
        this.deps.onChange()
        return
      case 'message':
        this.deps.onChange()
        return
      case 'turnEnded':
        this.update({ working: false, finished: true })
        this.deps.onChange()
        return
      case 'exited':
        this.handle = null
        // A restart keeps the mode the user last chose, not the config default.
        this.nextMode = this.runningMode
        this.end()
        return
    }
  }

  private onToolCall(call: AgentToolCall, signal: AbortSignalLike): Promise<AgentDecision> {
    if (signal.aborted) {
      return Promise.resolve(CANCELLED)
    }
    return new Promise((resolve) => {
      const item: PendingRequest = { request: toChatRequest(call), call, resolve }
      this.update({}, [...this.pending, item])
      this.deps.onChange()
      signal.addEventListener(
        'abort',
        () => {
          this.settle(call.id, CANCELLED)
        },
        { once: true },
      )
    })
  }

  private settle(requestId: string, decision: AgentDecision): void {
    const item = this.pending.find((candidate) => candidate.request.id === requestId)
    if (item === undefined) {
      return
    }
    this.update(
      {},
      this.pending.filter((candidate) => candidate !== item),
    )
    item.resolve(decision)
    this.deps.onChange()
  }

  // The process is gone: every open request is denied so no SDK call is left hanging.
  private end(): void {
    const pending = this.pending
    this.update({ running: false, working: false }, [])
    for (const item of pending) {
      item.resolve(SESSION_ENDED)
    }
    if (pending.length !== 0) {
      this.deps.onChange()
    }
  }

  private update(
    progress: Partial<Progress>,
    pending: readonly PendingRequest[] = this.pending,
  ): void {
    const before = this.attentionKey()
    this.progress = { ...this.progress, ...progress }
    this.pending = pending
    if (this.attentionKey() !== before) {
      this.deps.onAttention()
    }
  }

  private attentionKey(): string {
    const { running, working, finished } = this.progress
    const wait = waitOfRequests(this.pending.map((item) => item.request))
    return JSON.stringify([running, working, finished, wait])
  }
}
