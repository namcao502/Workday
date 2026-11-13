import { randomBytes, timingSafeEqual } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  addSession,
  addTerminal,
  afterEscape,
  bashRcText,
  buildShellLaunch,
  clearsWhenSeen,
  closeSession,
  isAcceptedPath,
  type ChatView,
  closeTab,
  nextWait,
  openTicket,
  parseHookEvent,
  sessionArgument,
  workingAfter,
  type OpenOutcome,
  type SessionView,
  type StartOutcome,
  type ShellLaunch,
  type WaitReason,
  type WorkspaceConfig,
  type WorkspaceTab,
  type WorkspaceView,
} from '@workday/core'
import type { EventSink } from '../events.js'
import { readChat } from './chatReader.js'
import { buildFileGroups, type FileGroup } from './fileGroups.js'
import { HOOKS_FOLDER, writeHookSettings } from './hookSettings.js'
import {
  defaultClaudeExecutable,
  findPowerShell7,
  folderHasTranscripts,
  isGuid,
  isTranscriptOfFolder,
  projectFolder,
  sessionEnvironment,
  transcriptExists,
} from './launchEnvironment.js'
import { openInVsCode, spawnEditor, type SpawnEditor } from './openInEditor.js'
import { WorkspaceStartError, type SpawnPty } from './pty.js'
import { isDirectory, SessionHost, type SessionDirectory } from './sessionHost.js'
import { TicketLauncher, type TicketLauncherDeps } from './ticketLauncher.js'
import { MAX_RECENT_FOLDERS, type WorkspaceState } from './workspaceStore.js'

export interface WorkspaceServiceDeps {
  readonly dataDir: string
  readonly config: WorkspaceConfig
  readonly initialState: WorkspaceState
  readonly save: (state: WorkspaceState) => Promise<void>
  readonly events: EventSink
  readonly spawn: SpawnPty
  readonly spawnEditor?: SpawnEditor // tests pass a fake; VS Code is never launched there
  readonly homeDir: string // ~/.claude/projects and ~/.local/bin live under it
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

interface Attention {
  readonly wait: WaitReason | null
  readonly working: boolean
}

const IDLE: Attention = { wait: null, working: false }
const PLAIN_BASH: ShellLaunch = { file: 'bash', args: ['-i'] }

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
  // New every server run; the hook URL carries it, so only our claude sessions can post hooks.
  readonly hookToken = randomBytes(32).toString('hex')
  private state: WorkspaceState
  private config: WorkspaceConfig
  private dataDir: string
  private hookBase: string | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private readonly hosts = new Map<string, SessionHost>()
  private readonly attention = new Map<string, Attention>()
  private readonly transcripts = new Map<string, string>() // newest accepted transcript path per session
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
    this.dataDir = deps.dataDir
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
  configure(config: WorkspaceConfig, dataDir: string): void {
    this.config = config
    this.dataDir = dataDir
  }

  setHookBase(url: string): void {
    this.hookBase = url.replace(/\/+$/, '')
  }

  addTerminal(folder: string | null): Promise<void> {
    return this.enqueue(() => {
      const { tabs } = addTerminal(this.state, folder)
      const recentFolders = recentWith(this.state.recentFolders, folder)
      return this.commit({ ...this.state, tabs, recentFolders }, true)
    })
  }

  // For the ticket Start / Open flow: a no-op when the tab is already open.
  openTicketTab(key: string): Promise<void> {
    return this.enqueue(() => this.commit({ ...this.state, ...openTicket(this.state, key) }, true))
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
      this.dropHosts([name])
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
      this.dropHosts(tab.sessions)
      return 'ok'
    })
  }

  seen(name: string): void {
    const current = this.attention.get(name) ?? IDLE
    if (current.wait !== null && clearsWhenSeen(current.wait)) {
      this.setAttention(name, { ...current, wait: null })
    }
    this.deps.onSeen?.(name)
  }

  // Esc closes a permission or question dialog, and claude sends no hook for that.
  escape(name: string): void {
    const current = this.attention.get(name) ?? IDLE
    this.setAttention(name, { ...current, wait: afterEscape(current.wait) })
  }

  // False only for a wrong token; a payload that is not a hook, or a closed session, is ignored.
  async onHook(session: string, token: string, payload: unknown): Promise<boolean> {
    const given = Buffer.from(token)
    const expected = Buffer.from(this.hookToken)
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return false
    }
    const event = parseHookEvent(payload)
    const tab = this.tabOf(session)
    if (event === null || tab === undefined) {
      return true
    }
    this.launcher.shipDone(session)
    const current = this.attention.get(session) ?? IDLE
    const wait = nextWait(current.wait, event)
    this.setAttention(session, {
      wait,
      working: workingAfter(event.eventName, current.working),
    })
    if (wait !== null && wait !== current.wait) {
      this.deps.onWait?.(session, tab, wait)
    }
    if (isAcceptedPath(event.transcriptPath, this.projectsRoot(), this.platform)) {
      this.transcripts.set(session, event.transcriptPath ?? '')
    }
    const cwd = this.hosts.get(session)?.currentDirectory ?? null
    const sessionId = event.sessionId
    if (
      cwd !== null &&
      sessionId !== null &&
      isGuid(sessionId) &&
      isTranscriptOfFolder(event.transcriptPath, cwd)
    ) {
      try {
        await this.rememberSessionId(session, cwd, sessionId.toLowerCase())
      } catch (error: unknown) {
        // Never the payload: a failed save only loses the resume id; claude must still get 200.
        this.logError(`Saving the session id of ${session} failed`, error)
      }
    }
    return true
  }

  // Null for an unknown session; empty until a hook or a saved id names a transcript.
  chat(name: string): ChatView | null {
    if (this.tabOf(name) === undefined) {
      return null
    }
    const cwd = this.hosts.get(name)?.currentDirectory ?? null
    const working = (this.attention.get(name) ?? IDLE).working
    return readChat(this.transcriptPath(name, cwd), cwd, working)
  }

  hasSession(name: string): boolean {
    return this.tabOf(name) !== undefined
  }

  // Null for a name that is no session of an open tab.
  host(name: string): SessionHost | null {
    if (this.tabOf(name) === undefined) {
      return null
    }
    const existing = this.hosts.get(name)
    if (existing !== undefined) {
      return existing
    }
    const host = new SessionHost({
      name,
      spawn: this.deps.spawn,
      directory: () => this.directoryOf(name),
      launch: (cwd) => this.launchFor(name, cwd),
      env: () => sessionEnvironment(this.environment),
      onStarted: () => {
        this.deps.events.broadcast({ type: 'workspace.changed' })
      },
      onEnded: () => {
        this.attention.delete(name)
        this.deps.events.broadcast({ type: 'workspace.changed' })
      },
    })
    this.hosts.set(name, host)
    return host
  }

  shutdown(): void {
    this.dropHosts([...this.hosts.keys()])
  }

  private projectsRoot(): string {
    return join(this.deps.homeDir, '.claude', 'projects')
  }

  private transcriptPath(name: string, cwd: string | null): string | null {
    const fromHook = this.transcripts.get(name)
    if (fromHook !== undefined) {
      return fromHook
    }
    const savedId = cwd === null ? undefined : this.state.sessionIds[sessionKey(name, cwd)]
    if (cwd === null || savedId === undefined) {
      return null
    }
    const saved = join(projectFolder(this.projectsRoot(), cwd), `${savedId.toLowerCase()}.jsonl`)
    return isAcceptedPath(saved, this.projectsRoot(), this.platform) ? saved : null
  }

  private sessionView(name: string): SessionView {
    const attention = this.attention.get(name) ?? IDLE
    return { name, running: this.hosts.get(name)?.running ?? false, ...attention }
  }

  private setAttention(name: string, next: Attention): void {
    const current = this.attention.get(name) ?? IDLE
    if (current.wait === next.wait && current.working === next.working) {
      return
    }
    this.attention.set(name, next)
    this.deps.events.broadcast({ type: 'workspace.changed' })
  }

  // /clear starts a new claude session id, which the next hook brings in.
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

  private launchFor(name: string, cwd: string): ShellLaunch {
    const tab = this.tabOf(name)
    const isWindows = this.platform === 'win32'
    const projectsRoot = join(this.deps.homeDir, '.claude', 'projects')
    const savedSessionId = this.state.sessionIds[sessionKey(name, cwd)] ?? null
    const startPrompt = this.launcher.pendingPrompt(name)
    // Without hook settings no first hook ever arrives, so the prompt runs this once only.
    if (this.hookBase === null) {
      this.launcher.shipDone(name)
    }
    const argument = sessionArgument({
      savedSessionId,
      transcriptExists:
        savedSessionId !== null && transcriptExists(projectsRoot, cwd, savedSessionId),
      folderHasTranscripts: folderHasTranscripts(projectsRoot, cwd),
      isMain: tab?.kind === 'ticket' && tab.id === name,
      startPrompt,
    })
    const settingsFile =
      this.hookBase === null
        ? null
        : writeHookSettings(this.dataDir, name, this.hookUrl(name), this.logError)
    const claudeExecutable =
      this.config.claudeExecutable ?? defaultClaudeExecutable(this.deps.homeDir, isWindows)
    if (isWindows) {
      const path = this.environment['PATH'] ?? this.environment['Path']
      return buildShellLaunch({
        platform: 'win32',
        powerShell7Path: findPowerShell7(path),
        claudeExecutable,
        settingsFile,
        argument,
        rcFile: null,
      })
    }
    const rcFile = this.writeRcFile(name, bashRcText(claudeExecutable, settingsFile, argument))
    if (rcFile === null) {
      return PLAIN_BASH
    }
    return buildShellLaunch({
      platform: 'other',
      powerShell7Path: null,
      claudeExecutable,
      settingsFile,
      argument,
      rcFile,
    })
  }

  // Null (logged) when it cannot be written; the session then opens a plain shell.
  private writeRcFile(name: string, text: string): string | null {
    try {
      const folder = join(this.dataDir, HOOKS_FOLDER)
      mkdirSync(folder, { recursive: true })
      const rcFile = join(folder, `${name}.rc`)
      writeFileSync(rcFile, text)
      return rcFile
    } catch (error: unknown) {
      this.logError(`Could not write the shell rc of ${name}`, error)
      return null
    }
  }

  private hookUrl(name: string): string {
    return `${this.hookBase ?? ''}/api/hooks/${this.hookToken}/${encodeURIComponent(name)}`
  }

  private findTab(id: string): WorkspaceTab | undefined {
    return this.state.tabs.find((tab) => tab.id === id)
  }

  private tabOf(name: string): WorkspaceTab | undefined {
    return this.state.tabs.find((tab) => tab.sessions.includes(name))
  }

  private dropHosts(names: readonly string[]): void {
    for (const name of names) {
      this.hosts.get(name)?.dispose()
      this.hosts.delete(name)
      this.attention.delete(name)
      this.transcripts.delete(name)
    }
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
