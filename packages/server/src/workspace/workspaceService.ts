import { join } from 'node:path'
import {
  addSession,
  addTerminal,
  closeSession,
  closeTab,
  isAcceptedPath,
  openTicket,
  waitOfRequests,
  type AgentMode,
  type ChatAnswer,
  type ChatView,
  type ClaudeAgent,
  type OpenOutcome,
  type SessionView,
  type StartOutcome,
  type WaitReason,
  type WorkspaceConfig,
  type WorkspaceTab,
  type WorkspaceView,
} from '@workday/core'
import type { EventSink } from '../events.js'
import type { PromptOutcome } from '../teams/teamsHandOff.js'
import { AgentSession, isDirectory, type SessionDirectory } from './agentSession.js'
import { readChat } from './chatReader.js'
import { buildFileGroups, type FileGroup } from './fileGroups.js'
import {
  folderHasTranscripts,
  isGuid,
  projectFolder,
  transcriptExists,
} from './launchEnvironment.js'
import { openInVsCode, spawnEditor, type SpawnEditor } from './openInEditor.js'
import { TicketLauncher, type TicketLauncherDeps } from './ticketLauncher.js'
import { WorkspaceStartError, type WorkspaceStartCode } from './workspaceStartError.js'
import { MAX_RECENT_FOLDERS, type WorkspaceState } from './workspaceStore.js'

export interface WorkspaceServiceDeps {
  readonly config: WorkspaceConfig
  readonly initialState: WorkspaceState
  readonly save: (state: WorkspaceState) => Promise<void>
  readonly events: EventSink
  readonly agent: ClaudeAgent
  readonly spawnEditor?: SpawnEditor // tests pass a fake; VS Code is never launched there
  readonly homeDir: string // ~/.claude/projects lives under it
  readonly platform?: 'win32' | 'other'
  readonly environment?: Readonly<Record<string, string | undefined>>
  readonly logError?: (message: string, error: unknown) => void
  // A session just got a new wait (different from its last one); onSeen: the user looked at a session.
  readonly onWait?: (session: string, tab: WorkspaceTab, wait: WaitReason) => void
  readonly onSeen?: (session: string) => void
  readonly board: TicketLauncherDeps['board']
  readonly timesheet: TicketLauncherDeps['timesheet']
  readonly createWorktree: TicketLauncherDeps['createWorktree']
}

// mainSession: the first session of a tab closes only with its tab.
export type WorkspaceOutcome = 'ok' | 'notFound' | 'mainSession'

// sessionNotFound: the tab closed while the prompt was on its way.
export type SendOutcome = 'sent' | 'notFound' | 'waiting' | WorkspaceStartCode

function sessionKey(name: string, cwd: string): string {
  return `${name}|${cwd}`
}

function withoutSessionIds(
  sessionIds: Readonly<Record<string, string>>,
  names: readonly string[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(sessionIds).filter(([key]) => !names.some((name) => key.startsWith(`${name}|`))),
  )
}

function recentWith(recent: readonly string[], folder: string | null): readonly string[] {
  if (folder === null) {
    return recent
  }
  const others = recent.filter((item) => item.toLowerCase() !== folder.toLowerCase())
  return [folder, ...others].slice(0, MAX_RECENT_FOLDERS)
}

export class WorkspaceService {
  private state: WorkspaceState
  private config: WorkspaceConfig
  private queue: Promise<unknown> = Promise.resolve()
  private readonly sessions = new Map<string, AgentSession>()
  private readonly waits = new Map<string, WaitReason>() // last wait per session, for onWait
  private readonly platform: 'win32' | 'other'
  private readonly environment: Readonly<Record<string, string | undefined>>
  private readonly logError: (message: string, error: unknown) => void
  private readonly launcher: TicketLauncher

  constructor(private readonly deps: WorkspaceServiceDeps) {
    this.launcher = new TicketLauncher({
      config: () => this.config,
      board: deps.board,
      timesheet: deps.timesheet,
      createWorktree: deps.createWorktree,
      openTab: (key) => this.openTicketTab(key),
      changed: () => {
        deps.events.broadcast({ type: 'workspace.changed' })
      },
    })
    this.state = deps.initialState
    this.config = deps.config
    this.platform = deps.platform ?? (process.platform === 'win32' ? 'win32' : 'other')
    this.environment = deps.environment ?? process.env
    this.logError = deps.logError ?? console.error
  }

  view(): WorkspaceView {
    const devRepo = this.config.devRepoPath
    return {
      configured: devRepo !== null && isDirectory(devRepo),
      tabs: this.state.tabs,
      sessions: this.state.tabs.flatMap((tab) =>
        tab.sessions.map((name) => this.sessionView(name)),
      ),
      starting: this.launcher.startingKeys(),
      recentFolders: this.state.recentFolders,
    }
  }

  // Null for an unknown tab.
  async fileGroups(tabId: string): Promise<readonly FileGroup[] | null> {
    const tab = this.findTab(tabId)
    return tab === undefined ? null : buildFileGroups(tab, this.config)
  }

  // False (logged) when VS Code could not be started.
  openEditor(target: string): Promise<boolean> {
    return openInVsCode(target, {
      isWindows: this.platform === 'win32',
      environment: this.environment,
      spawn: this.deps.spawnEditor ?? spawnEditor,
      logError: this.logError,
    })
  }

  localOnlyPaths(): readonly string[] {
    return this.config.localOnlyPaths
  }

  // Running sessions keep their folder; the next start uses the new dev repo.
  configure(config: WorkspaceConfig): void {
    this.config = config
  }

  // Opens a folder tab; the name stays from the terminal days because the client calls it.
  addTerminal(folder: string | null): Promise<void> {
    return this.enqueue(() => {
      const { tabs } = addTerminal(this.state, folder)
      const recentFolders = recentWith(this.state.recentFolders, folder)
      return this.commit({ ...this.state, tabs, recentFolders }, true)
    })
  }

  // For the ticket Start / Open flow: a no-op when the tab is already open.
  async openTicketTab(key: string): Promise<void> {
    await this.enqueue(() => this.commit({ ...this.state, ...openTicket(this.state, key) }, true))
    this.sendStartPrompt(key)
  }

  start(key: string): Promise<StartOutcome> {
    return this.launcher.start(key)
  }

  open(key: string, recreate: boolean): Promise<OpenOutcome> {
    return this.launcher.open(key, recreate)
  }

  addSession(tabId: string): Promise<WorkspaceOutcome> {
    return this.enqueue(async () => {
      if (this.findTab(tabId) === undefined) {
        return 'notFound'
      }
      await this.commit({ ...this.state, ...addSession(this.state, tabId) }, true)
      return 'ok'
    })
  }

  closeSession(name: string): Promise<WorkspaceOutcome> {
    return this.enqueue(async () => {
      const tab = this.tabOf(name)
      if (tab === undefined) {
        return 'notFound'
      }
      if (tab.sessions[0] === name) {
        return 'mainSession'
      }
      const { tabs } = closeSession(this.state, tab.id, name)
      const sessionIds = withoutSessionIds(this.state.sessionIds, [name])
      await this.commit({ ...this.state, tabs, sessionIds }, true)
      this.disposeSessions([name])
      return 'ok'
    })
  }

  closeTab(id: string): Promise<WorkspaceOutcome> {
    return this.enqueue(async () => {
      const tab = this.findTab(id)
      if (tab === undefined) {
        return 'notFound'
      }
      const { tabs } = closeTab(this.state, id)
      const sessionIds = withoutSessionIds(this.state.sessionIds, tab.sessions)
      await this.commit({ ...this.state, tabs, sessionIds }, true)
      this.disposeSessions(tab.sessions)
      return 'ok'
    })
  }

  seen(name: string): void {
    this.sessions.get(name)?.seen()
    this.deps.onSeen?.(name)
  }

  hasSession(name: string): boolean {
    return this.tabOf(name) !== undefined
  }

  shutdown(): void {
    this.disposeSessions([...this.sessions.keys()])
  }

  // Null for an unknown session; no messages until a session id (from init or saved) names a transcript.
  chat(name: string): ChatView | null {
    if (this.tabOf(name) === undefined) {
      return null
    }
    const session = this.sessions.get(name)
    const cwd = session?.state.cwd ?? this.idleDirectory(name)
    const sessionId = session?.state.sessionId ?? null
    const view = readChat(
      this.transcriptPath(name, cwd, sessionId),
      cwd,
      session?.state.working === true,
    )
    if (session === undefined) {
      return { ...view, mode: this.config.permissionMode }
    }
    const { requests, running, mode, model } = session.state
    return { ...view, requests, running, mode, model }
  }

  // An open request blocks a new prompt: the user answers it first.
  send(name: string, text: string): SendOutcome {
    const session = this.session(name)
    if (session === null) {
      return 'notFound'
    }
    if (session.state.requests.length !== 0) {
      return 'waiting'
    }
    try {
      session.send(text)
      return 'sent'
    } catch (error: unknown) {
      if (error instanceof WorkspaceStartError) {
        return error.code
      }
      throw error
    }
  }

  // 'sent' when a prompt may be sent now; a stopped session starts with it.
  promptState(name: string): PromptOutcome {
    if (this.tabOf(name) === undefined) {
      return 'notFound'
    }
    const requests = this.sessions.get(name)?.state.requests ?? []
    return requests.length === 0 ? 'sent' : 'waiting'
  }

  // For the Teams hand-off: a session that cannot start is notRunning.
  prompt(name: string, text: string): PromptOutcome {
    const outcome = this.send(name, text)
    if (outcome === 'sent' || outcome === 'notFound' || outcome === 'waiting') {
      return outcome
    }
    this.logError(`Starting session ${name} failed: ${outcome}`, null)
    return 'notRunning'
  }

  answer(name: string, requestId: string, answer: ChatAnswer): 'ok' | 'notFound' | 'invalid' {
    if (this.tabOf(name) === undefined) {
      return 'notFound'
    }
    return this.sessions.get(name)?.answer(requestId, answer) ?? 'notFound'
  }

  // False for an unknown session; a stopped one has nothing to interrupt.
  async interrupt(name: string): Promise<boolean> {
    if (this.tabOf(name) === undefined) {
      return false
    }
    await this.sessions.get(name)?.interrupt()
    return true
  }

  // False for an unknown session; a stopped one keeps the mode for its next start.
  async setMode(name: string, mode: AgentMode): Promise<boolean> {
    const session = this.session(name)
    if (session === null) {
      return false
    }
    await session.setMode(mode)
    return true
  }

  // Null for a name that is no session of an open tab.
  private session(name: string): AgentSession | null {
    if (this.tabOf(name) === undefined) {
      return null
    }
    const existing = this.sessions.get(name)
    if (existing !== undefined) {
      return existing
    }
    const session = new AgentSession({
      name,
      agent: this.deps.agent,
      directory: () => this.directoryOf(name),
      resumeId: (cwd) => this.resumeId(name, cwd),
      continueLatest: (cwd) => this.continueLatest(name, cwd),
      mode: () => this.config.permissionMode,
      onChange: () => {
        this.deps.events.broadcast({ type: 'chat.changed' })
      },
      onAttention: () => {
        this.onAttention(name)
      },
      onSessionId: (cwd, sessionId) => {
        this.onSessionId(name, cwd, sessionId)
      },
    })
    this.sessions.set(name, session)
    return session
  }

  // Runs once, right after Start opened the tab of a worktree it created.
  private sendStartPrompt(key: string): void {
    const prompt = this.launcher.pendingPrompt(key)
    if (prompt === null) {
      return
    }
    const outcome = this.send(key, prompt)
    this.launcher.shipDone(key)
    if (outcome !== 'sent') {
      this.logError(`The start prompt of ${key} was not sent: ${outcome}`, null)
    }
  }

  private onAttention(name: string): void {
    const session = this.sessions.get(name)
    const tab = this.tabOf(name)
    if (session !== undefined && tab !== undefined) {
      const wait = this.waitOf(session)
      const previous = this.waits.get(name) ?? null
      if (wait === null) {
        this.waits.delete(name)
      } else {
        this.waits.set(name, wait)
      }
      if (wait !== null && wait !== previous) {
        this.deps.onWait?.(name, tab, wait)
      }
    }
    this.deps.events.broadcast({ type: 'workspace.changed' })
  }

  private onSessionId(name: string, cwd: string, sessionId: string): void {
    if (!isGuid(sessionId)) {
      return
    }
    this.rememberSessionId(name, cwd, sessionId.toLowerCase()).catch((error: unknown) => {
      this.logError(`Saving the session id of ${name} failed`, error)
    })
  }

  private waitOf(session: AgentSession): WaitReason | null {
    const { requests, finished } = session.state
    return waitOfRequests(requests) ?? (finished ? 'finished' : null)
  }

  private sessionView(name: string): SessionView {
    const session = this.sessions.get(name)
    if (session === undefined) {
      return { name, running: false, working: false, wait: null }
    }
    const { running, working } = session.state
    return { name, running, working, wait: this.waitOf(session) }
  }

  private projectsRoot(): string {
    return join(this.deps.homeDir, '.claude', 'projects')
  }

  private savedSessionId(name: string, cwd: string): string | null {
    return this.state.sessionIds[sessionKey(name, cwd)] ?? null
  }

  private resumeId(name: string, cwd: string): string | null {
    const saved = this.savedSessionId(name, cwd)
    return saved !== null && transcriptExists(this.projectsRoot(), cwd, saved) ? saved : null
  }

  // Only the main session of a ticket picks up the latest transcript of its worktree.
  private continueLatest(name: string, cwd: string): boolean {
    const tab = this.tabOf(name)
    return (
      tab?.kind === 'ticket' && tab.id === name && folderHasTranscripts(this.projectsRoot(), cwd)
    )
  }

  private transcriptPath(
    name: string,
    cwd: string | null,
    sessionId: string | null,
  ): string | null {
    if (cwd === null) {
      return null
    }
    const id = sessionId ?? this.savedSessionId(name, cwd)
    if (id === null || !isGuid(id)) {
      return null
    }
    const path = join(projectFolder(this.projectsRoot(), cwd), `${id.toLowerCase()}.jsonl`)
    return isAcceptedPath(path, this.projectsRoot(), this.platform) ? path : null
  }

  // The folder a stopped session would start in; null when it cannot start.
  private idleDirectory(name: string): string | null {
    try {
      const { path, fallback } = this.directoryOf(name)
      return isDirectory(path) || fallback === null ? path : fallback
    } catch (error: unknown) {
      if (error instanceof WorkspaceStartError) {
        return null
      }
      throw error
    }
  }

  // /clear starts a new claude session id, which the next init brings in.
  private rememberSessionId(name: string, cwd: string, sessionId: string): Promise<void> {
    return this.enqueue(() => {
      const key = sessionKey(name, cwd)
      if (this.tabOf(name) === undefined || this.state.sessionIds[key] === sessionId) {
        return Promise.resolve()
      }
      const sessionIds = { ...this.state.sessionIds, [key]: sessionId }
      return this.commit({ ...this.state, sessionIds }, false)
    })
  }

  private directoryOf(name: string): SessionDirectory {
    const tab = this.tabOf(name)
    if (tab === undefined) {
      throw new WorkspaceStartError('sessionNotFound')
    }
    const devRepo = this.config.devRepoPath
    if (tab.kind === 'ticket') {
      if (devRepo === null) {
        throw new WorkspaceStartError('workspaceNotConfigured')
      }
      return { path: join(devRepo, '.claude', 'worktrees', tab.id), fallback: null }
    }
    const fallback = devRepo !== null && isDirectory(devRepo) ? devRepo : null
    const path = tab.folder ?? devRepo
    if (path === null || (!isDirectory(path) && fallback === null)) {
      throw new WorkspaceStartError('workspaceNotConfigured')
    }
    return { path, fallback }
  }

  private disposeSessions(names: readonly string[]): void {
    for (const name of names) {
      const session = this.sessions.get(name)
      this.sessions.delete(name)
      this.waits.delete(name)
      session?.dispose()
    }
  }

  private findTab(id: string): WorkspaceTab | undefined {
    return this.state.tabs.find((tab) => tab.id === id)
  }

  private tabOf(name: string): WorkspaceTab | undefined {
    return this.state.tabs.find((tab) => tab.sessions.includes(name))
  }

  private enqueue<Result>(work: () => Promise<Result>): Promise<Result> {
    const run = this.queue.then(work)
    this.queue = run.catch(() => undefined)
    return run
  }

  // Saved to disk first, so a failed write leaves memory as it was.
  private async commit(next: WorkspaceState, broadcast: boolean): Promise<void> {
    if (JSON.stringify(next) === JSON.stringify(this.state)) {
      return
    }
    await this.deps.save(next)
    this.state = next
    if (broadcast) {
      this.deps.events.broadcast({ type: 'workspace.changed' })
    }
  }
}
