import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claudeProjectDirName, type ServerEvent, type WaitReason } from '@workday/core'
import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKSPACE } from '../config.js'
import { FakeClaudeAgent } from '../testing/fakeAgent.js'
import type { WorktreeOptions, WorktreeResult } from './worktreeService.js'
import { WorkspaceService } from './workspaceService.js'
import { EMPTY_WORKSPACE, type WorkspaceState } from './workspaceStore.js'

const SESSION_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const PROMPT_LINE = `${JSON.stringify({ type: 'user', message: { content: 'hi' } })}\n`

interface Built {
  readonly service: WorkspaceService
  readonly agent: FakeClaudeAgent
  readonly events: ServerEvent[]
  readonly saved: WorkspaceState[]
  readonly waits: { session: string; wait: WaitReason }[]
  readonly seen: string[]
  readonly devRepo: string
  readonly homeDir: string
  readonly git: FakeGit
}

interface FakeGit {
  readonly created: WorktreeOptions[]
  readonly boardStarts: string[]
  readonly queued: (readonly string[])[]
  readonly result: { value: WorktreeResult }
  readonly parents: Record<string, string>
}

type StateFactory = (paths: {
  readonly devRepo: string
  readonly homeDir: string
}) => WorkspaceState

function build(state: WorkspaceState | StateFactory = EMPTY_WORKSPACE): Built {
  const root = mkdtempSync(join(tmpdir(), 'workday-service-'))
  const devRepo = join(root, 'repo')
  const homeDir = join(root, 'home')
  mkdirSync(devRepo)
  mkdirSync(homeDir)
  const initialState = typeof state === 'function' ? state({ devRepo, homeDir }) : state
  const agent = new FakeClaudeAgent()
  const events: ServerEvent[] = []
  const saved: WorkspaceState[] = []
  const waits: { session: string; wait: WaitReason }[] = []
  const seen: string[] = []
  const git: FakeGit = {
    created: [],
    boardStarts: [],
    queued: [],
    result: { value: 'created' },
    parents: {},
  }
  const service = new WorkspaceService({
    board: {
      parentKeyOf: (key) => git.parents[key] ?? null,
      start: (key) => {
        git.boardStarts.push(key)
        return Promise.resolve()
      },
    },
    timesheet: {
      queueToday: (keys) => {
        git.queued.push(keys)
        return Promise.resolve()
      },
    },
    // Yields once so two Start calls overlap, like a real fetch would.
    createWorktree: async (options) => {
      git.created.push(options)
      await new Promise((resolve) => setTimeout(resolve, 5))
      if (git.result.value === 'created' || git.result.value === 'mainNotMerged') {
        mkdirSync(options.worktreePath, { recursive: true })
      }
      return git.result.value
    },
    config: { ...DEFAULT_WORKSPACE, devRepoPath: devRepo, startPrompt: 'ship {key}' },
    initialState,
    save: (next) => {
      saved.push(next)
      return Promise.resolve()
    },
    events: { broadcast: (event) => events.push(event) },
    agent,
    homeDir,
    onWait: (session, _tab, wait) => {
      waits.push({ session, wait })
    },
    onSeen: (session) => {
      seen.push(session)
    },
    logError: () => undefined,
  })
  return { service, agent, events, saved, waits, seen, devRepo, homeDir, git }
}

function terminalState(...sessions: string[]): WorkspaceState {
  return { ...EMPTY_WORKSPACE, tabs: [{ id: 'claude', kind: 'terminal', folder: null, sessions }] }
}

function transcriptFolder(homeDir: string, cwd: string): string {
  const folder = join(homeDir, '.claude', 'projects', claudeProjectDirName(cwd))
  mkdirSync(folder, { recursive: true })
  return folder
}

// Lets the serial save chain run (rememberSessionId goes through it).
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('WorkspaceService tabs', () => {
  it('addTerminal names the second terminal claude2 and saves before broadcasting', async () => {
    const { service, events, saved } = build(terminalState('claude'))
    await service.addTerminal(null)
    expect(service.view().tabs.map((tab) => tab.id)).toEqual(['claude', 'claude2'])
    expect(saved).toHaveLength(1)
    expect(events).toEqual([{ type: 'workspace.changed' }])
  })

  it('addSession adds <tab>~2', async () => {
    const { service } = build(terminalState('claude'))
    expect(await service.addSession('claude')).toBe('ok')
    expect(service.view().tabs[0]?.sessions).toEqual(['claude', 'claude~2'])
    expect(await service.addSession('nope')).toBe('notFound')
  })

  it('closing a tab disposes its sessions', async () => {
    const { service, agent, devRepo, saved } = build({
      ...terminalState('claude', 'claude~2'),
      sessionIds: { 'claude|x': SESSION_ID, 'claude~2|y': SESSION_ID, 'other|z': SESSION_ID },
    })
    service.prompt('claude', 'a')
    service.prompt('claude~2', 'b')
    expect(await service.closeTab('claude')).toBe('ok')
    expect(agent.handles.map((handle) => handle.closed)).toEqual([true, true])
    expect(agent.last().options.cwd).toBe(devRepo)
    expect(service.view().tabs).toEqual([])
    expect(service.prompt('claude', 'c')).toBe('notFound')
    expect(saved.at(-1)?.sessionIds).toEqual({ 'other|z': SESSION_ID })
    expect(await service.closeTab('claude')).toBe('notFound')
  })

  it('closeSession refuses the main session and an unknown name, and disposes the closed one', async () => {
    const { service, agent } = build(terminalState('claude', 'claude~2'))
    service.prompt('claude~2', 'a')
    expect(await service.closeSession('claude')).toBe('mainSession')
    expect(await service.closeSession('ghost')).toBe('notFound')
    expect(await service.closeSession('claude~2')).toBe('ok')
    expect(service.view().tabs[0]?.sessions).toEqual(['claude'])
    expect(agent.last().closed).toBe(true)
  })

  it('shutdown closes every session', () => {
    const { service, agent } = build(terminalState('claude', 'claude~2'))
    service.prompt('claude', 'a')
    service.prompt('claude~2', 'b')
    service.shutdown()
    expect(agent.handles.map((handle) => handle.closed)).toEqual([true, true])
  })
})

describe('WorkspaceService chat and prompt', () => {
  it('chat returns transcript messages plus the open requests and session state', () => {
    const { service, agent, devRepo, homeDir } = build(terminalState('claude'))
    writeFileSync(join(transcriptFolder(homeDir, devRepo), `${SESSION_ID}.jsonl`), PROMPT_LINE)
    expect(service.chat('ghost')).toBeNull()
    expect(service.chat('claude')).toMatchObject({ messages: [], running: false, requests: [] })

    service.prompt('claude', 'hi')
    agent.last().emit({ type: 'init', sessionId: SESSION_ID, model: 'opus', mode: 'plan' })
    void agent.last().toolCall('Bash', { command: 'ls' })

    const chat = service.chat('claude')
    expect(chat?.messages.map((message) => message.text)).toEqual(['hi'])
    expect(chat?.requests).toMatchObject([{ kind: 'permission', detail: 'ls' }])
    expect(chat).toMatchObject({ running: true, working: true, mode: 'plan', model: 'opus' })
  })

  it('prompt starts the session and a second prompt reuses it', () => {
    const { service, agent, devRepo, events } = build(terminalState('claude'))
    expect(service.prompt('claude', 'one')).toBe('sent')
    expect(service.prompt('claude', 'two')).toBe('sent')
    expect(agent.handles).toHaveLength(1)
    expect(agent.last().sent).toEqual(['one', 'two'])
    expect(agent.last().options).toMatchObject({ cwd: devRepo, mode: 'default', resume: null })
    expect(service.view().sessions[0]).toEqual({
      name: 'claude',
      running: true,
      working: true,
      wait: null,
    })
    agent.last().emit({ type: 'message' })
    expect(events.at(-1)).toEqual({ type: 'chat.changed' })
  })

  it('prompt while a request is open returns waiting and sends nothing', () => {
    const { service, agent } = build(terminalState('claude'))
    expect(service.prompt('ghost', 'x')).toBe('notFound')
    expect(service.promptState('claude')).toBe('sent')
    service.prompt('claude', 'one')
    void agent.last().toolCall('AskUserQuestion', { questions: [] })
    expect(service.promptState('claude')).toBe('waiting')
    expect(service.prompt('claude', 'two')).toBe('waiting')
    expect(agent.last().sent).toEqual(['one'])
  })

  it('a prompt to a ticket whose worktree is gone is notRunning', async () => {
    const { service, agent } = build()
    await service.openTicketTab('MDP-9')
    expect(service.prompt('MDP-9', 'x')).toBe('notRunning')
    expect(service.send('MDP-9', 'x')).toBe('worktreeMissing')
    expect(agent.handles).toEqual([])
  })

  it('a new wait calls onWait once; seen clears finished', async () => {
    const { service, agent, waits, seen } = build(terminalState('claude'))
    service.prompt('claude', 'one')
    const first = agent.last().toolCall('Bash', { command: 'ls' })
    void agent.last().toolCall('Bash', { command: 'pwd' })
    expect(waits).toEqual([{ session: 'claude', wait: 'permission' }])
    expect(service.answer('claude', first.call.id, { kind: 'allow', always: false })).toBe('ok')
    expect(await first.decision).toEqual({ kind: 'allow', always: false })
    expect(waits).toHaveLength(1)
    agent.last().emit({ type: 'turnEnded', ok: true })
    expect(waits.at(-1)).toEqual({ session: 'claude', wait: 'permission' })
    service.chat('claude')?.requests.forEach((request) => {
      service.answer('claude', request.id, { kind: 'deny', message: '' })
    })
    expect(waits.at(-1)).toEqual({ session: 'claude', wait: 'finished' })
    expect(service.view().sessions[0]?.wait).toBe('finished')
    service.seen('claude')
    expect(service.view().sessions[0]?.wait).toBeNull()
    expect(seen).toEqual(['claude'])
    expect(waits).toHaveLength(2)
  })

  it('interrupt and setMode reach the session; answer of an unknown id is notFound', async () => {
    const { service, agent } = build(terminalState('claude'))
    expect(await service.setMode('claude', 'plan')).toBe(true)
    service.prompt('claude', 'one')
    expect(agent.last().options.mode).toBe('plan')
    expect(await service.interrupt('claude')).toBe(true)
    expect(await service.setMode('claude', 'acceptEdits')).toBe(true)
    expect(agent.last().interrupts).toBe(1)
    expect(agent.last().modes).toEqual(['acceptEdits'])
    expect(await service.interrupt('ghost')).toBe(false)
    expect(service.answer('claude', 'nope', { kind: 'approvePlan' })).toBe('notFound')
    expect(service.answer('ghost', 'nope', { kind: 'approvePlan' })).toBe('notFound')
  })

  it('stores the session id from init and resumes it on the next start', async () => {
    const { service, agent, saved, devRepo, homeDir } = build(terminalState('claude'))
    writeFileSync(join(transcriptFolder(homeDir, devRepo), `${SESSION_ID}.jsonl`), '')
    service.prompt('claude', 'one')
    agent.last().emit({ type: 'init', sessionId: SESSION_ID, model: 'opus', mode: 'default' })
    await settle()
    expect(saved.at(-1)?.sessionIds).toEqual({ [`claude|${devRepo}`]: SESSION_ID })
    agent.last().emit({ type: 'exited', error: null })
    service.prompt('claude', 'two')
    expect(agent.handles).toHaveLength(2)
    expect(agent.last().options.resume).toBe(SESSION_ID)
  })
})

describe('WorkspaceService start and open', () => {
  it('two simultaneous starts create the worktree once and show the key as starting', async () => {
    const { service, git, devRepo } = build()
    const first = service.start('MDP-1')
    expect(service.view().starting).toEqual(['MDP-1'])
    const [one, two] = await Promise.all([first, service.start('MDP-1')])
    expect(one).toEqual({ ok: true, warning: null })
    expect(two).toEqual({ ok: true, warning: null })
    expect(git.created).toEqual([
      {
        ticketKey: 'MDP-1',
        repoPath: devRepo,
        worktreePath: join(devRepo, '.claude', 'worktrees', 'MDP-1'),
        parentKey: null,
      },
    ])
    expect(git.boardStarts).toEqual(['MDP-1'])
    expect(git.queued).toEqual([['MDP-1']])
    expect(service.view().starting).toEqual([])
    expect(service.view().tabs.map((tab) => tab.id)).toEqual(['MDP-1'])
  })

  it('passes the board parent of a sub-task to the worktree', async () => {
    const { service, git } = build()
    git.parents['MDP-2'] = 'MDP-1'
    await service.start('MDP-2')
    expect(git.created[0]?.parentKey).toBe('MDP-1')
  })

  it('rejects a bad key and an unconfigured workspace without touching git', async () => {
    const { service, git } = build()
    expect(await service.start('nope')).toEqual({ ok: false, error: { code: 'invalidKey' } })
    service.configure({ ...DEFAULT_WORKSPACE, devRepoPath: null })
    expect(await service.start('MDP-1')).toEqual({
      ok: false,
      error: { code: 'workspaceNotConfigured' },
    })
    expect(git.created).toEqual([])
    expect(git.boardStarts).toEqual([])
  })

  it('Start of a new ticket sends the start prompt to its main session once', async () => {
    const { service, agent, devRepo } = build()
    await service.start('MDP-1')
    expect(agent.handles).toHaveLength(1)
    expect(agent.last().sent).toEqual(['ship MDP-1'])
    expect(agent.last().options.cwd).toBe(join(devRepo, '.claude', 'worktrees', 'MDP-1'))
    await service.start('MDP-1')
    await service.open('MDP-1', false)
    expect(agent.handles).toHaveLength(1)
    expect(agent.last().sent).toEqual(['ship MDP-1'])
  })

  it('an existing worktree is reused and gets no start prompt', async () => {
    const { service, git, agent, devRepo } = build()
    mkdirSync(join(devRepo, '.claude', 'worktrees', 'MDP-1'), { recursive: true })
    expect(await service.start('MDP-1')).toEqual({ ok: true, warning: null })
    expect(git.created).toEqual([])
    expect(git.boardStarts).toEqual(['MDP-1'])
    expect(agent.handles).toEqual([])
  })

  it('the main ticket session continues the latest transcript of its folder', async () => {
    const { service, agent, devRepo, homeDir } = build()
    const worktree = join(devRepo, '.claude', 'worktrees', 'MDP-1')
    mkdirSync(worktree, { recursive: true })
    writeFileSync(join(transcriptFolder(homeDir, worktree), `${SESSION_ID}.jsonl`), '')
    await service.start('MDP-1')
    await service.addSession('MDP-1')
    service.prompt('MDP-1', 'x')
    service.prompt('MDP-1~2', 'y')
    expect(agent.handles.map((handle) => handle.options.continueLatest)).toEqual([true, false])
  })

  it('a failed worktree still starts the ticket on the board and queue but opens no tab', async () => {
    const { service, git, agent } = build()
    git.result.value = 'failed'
    expect(await service.start('MDP-1')).toEqual({ ok: false, error: { code: 'worktreeFailed' } })
    expect(git.boardStarts).toEqual(['MDP-1'])
    expect(git.queued).toEqual([['MDP-1']])
    expect(service.view().tabs).toEqual([])
    expect(service.view().starting).toEqual([])
    expect(agent.handles).toEqual([])
    git.result.value = 'parentBranchMissing'
    expect(await service.start('MDP-1')).toEqual({
      ok: false,
      error: { code: 'parentBranchMissing' },
    })
  })

  it('mainNotMerged opens the tab with a warning', async () => {
    const { service, git } = build()
    git.result.value = 'mainNotMerged'
    expect(await service.start('MDP-1')).toEqual({
      ok: true,
      warning: { code: 'mainNotMerged' },
    })
    expect(service.view().tabs.map((tab) => tab.id)).toEqual(['MDP-1'])
  })

  it('open reuses a worktree, asks before recreating a missing one, and never ships', async () => {
    const { service, git, agent } = build()
    expect(await service.open('MDP-1', false)).toEqual({ ok: false, confirmRecreate: true })
    expect(git.created).toEqual([])
    expect(service.view().tabs).toEqual([])
    expect(await service.open('MDP-1', true)).toEqual({ ok: true, warning: null })
    expect(git.created).toHaveLength(1)
    expect(git.boardStarts).toEqual([])
    expect(agent.handles).toEqual([])
    expect(await service.open('MDP-1', false)).toEqual({ ok: true, warning: null })
  })

  it('open while the key is starting does nothing', async () => {
    const { service, git } = build()
    const starting = service.start('MDP-1')
    expect(await service.open('MDP-1', true)).toEqual({ ok: true, warning: null })
    await starting
    expect(git.created).toHaveLength(1)
  })
})
