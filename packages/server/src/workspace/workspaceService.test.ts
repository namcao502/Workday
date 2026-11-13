import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claudeProjectDirName, type ServerEvent } from '@workday/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WORKSPACE } from '../config.js'
import { FakePtyFactory } from '../testing/fakePty.js'
import { WorkspaceStartError } from './pty.js'
import type { WorktreeOptions, WorktreeResult } from './worktreeService.js'
import { WorkspaceService } from './workspaceService.js'
import { EMPTY_WORKSPACE, type WorkspaceState } from './workspaceStore.js'

const SESSION_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'

interface Built {
  readonly service: WorkspaceService
  readonly ptys: FakePtyFactory
  readonly events: ServerEvent[]
  readonly saved: WorkspaceState[]
  readonly saveFails: { value: boolean }
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
  const ptys = new FakePtyFactory()
  const events: ServerEvent[] = []
  const saved: WorkspaceState[] = []
  const saveFails = { value: false }
  const git: FakeGit = { created: [], boardStarts: [], queued: [], result: { value: 'created' }, parents: {} }
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
    dataDir: join(root, 'data'),
    config: { ...DEFAULT_WORKSPACE, devRepoPath: devRepo, startPrompt: 'ship {key}' },
    initialState,
    save: (state) => {
      if (saveFails.value) {
        return Promise.reject(new Error('disk full'))
      }
      saved.push(state)
      return Promise.resolve()
    },
    events: { broadcast: (event) => events.push(event) },
    spawn: ptys.spawn,
    homeDir,
    environment: { PATH: '', CLAUDECODE: '1', KEEP: 'yes' },
    logError: () => undefined,
  })
  service.setHookBase('http://127.0.0.1:4870')
  return { service, ptys, events, saved, saveFails, devRepo, homeDir, git }
}

function terminalState(...sessions: string[]): WorkspaceState {
  return { ...EMPTY_WORKSPACE, tabs: [{ id: 'claude', kind: 'terminal', folder: null, sessions }] }
}

function startHost(service: WorkspaceService, name: string): void {
  const host = service.host(name)
  expect(host).not.toBeNull()
  host?.start(80, 24)
}

describe('WorkspaceService', () => {
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

  it('closeTab stops every session and forgets their ids', async () => {
    const { service, ptys, devRepo, saved } = build({
      ...terminalState('claude', 'claude~2'),
      sessionIds: { 'claude|x': SESSION_ID, 'claude~2|y': SESSION_ID, 'other|z': SESSION_ID },
    })
    startHost(service, 'claude')
    startHost(service, 'claude~2')
    expect(await service.closeTab('claude')).toBe('ok')
    expect(ptys.spawned.every((pty) => pty.killed)).toBe(true)
    expect(ptys.last().options.cwd).toBe(devRepo)
    expect(service.view().tabs).toEqual([])
    expect(service.host('claude')).toBeNull()
    expect(saved.at(-1)?.sessionIds).toEqual({ 'other|z': SESSION_ID })
    expect(await service.closeTab('claude')).toBe('notFound')
  })

  it('closeSession refuses the main session and an unknown name', async () => {
    const { service } = build(terminalState('claude', 'claude~2'))
    expect(await service.closeSession('claude')).toBe('mainSession')
    expect(await service.closeSession('ghost')).toBe('notFound')
    expect(await service.closeSession('claude~2')).toBe('ok')
    expect(service.view().tabs[0]?.sessions).toEqual(['claude'])
  })

  it('a Stop hook sets finished and broadcasts; a repeated PreToolUse does not', async () => {
    const { service, events } = build(terminalState('claude'))
    const token = service.hookToken
    await service.onHook('claude', token, { hook_event_name: 'PreToolUse', tool_name: 'Bash' })
    const afterFirst = events.length
    await service.onHook('claude', token, { hook_event_name: 'PreToolUse', tool_name: 'Bash' })
    expect(events.length).toBe(afterFirst)
    await service.onHook('claude', token, { hook_event_name: 'Stop' })
    expect(events.length).toBe(afterFirst + 1)
    expect(service.view().sessions[0]).toEqual({
      name: 'claude',
      running: false,
      wait: 'finished',
      working: false,
    })
  })

  it('a wrong token is refused', async () => {
    const { service } = build(terminalState('claude'))
    expect(await service.onHook('claude', 'wrong', { hook_event_name: 'Stop' })).toBe(false)
    expect(service.view().sessions[0]?.wait).toBeNull()
  })

  it('seen clears finished but not permission', async () => {
    const { service } = build(terminalState('claude', 'claude~2'))
    const token = service.hookToken
    await service.onHook('claude', token, { hook_event_name: 'Stop' })
    await service.onHook('claude~2', token, {
      hook_event_name: 'Notification',
      notification_type: 'permission_prompt',
    })
    service.seen('claude')
    service.seen('claude~2')
    expect(service.view().sessions.map((session) => session.wait)).toEqual([null, 'permission'])
    service.escape('claude~2')
    expect(service.view().sessions[1]?.wait).toBeNull()
  })

  it('stores the session id only when the transcript is in the folder of the session', async () => {
    const { service, saved, devRepo, homeDir } = build(terminalState('claude'))
    startHost(service, 'claude')
    const projects = join(homeDir, '.claude', 'projects')
    const token = service.hookToken
    await service.onHook('claude', token, {
      hook_event_name: 'UserPromptSubmit',
      session_id: SESSION_ID,
      transcript_path: join(projects, 'C--elsewhere', `${SESSION_ID}.jsonl`),
    })
    expect(saved).toEqual([])
    await service.onHook('claude', token, {
      hook_event_name: 'UserPromptSubmit',
      session_id: SESSION_ID,
      transcript_path: join(
        projects,
        claudeProjectDirName(devRepo).toUpperCase(),
        `${SESSION_ID}.jsonl`,
      ),
    })
    expect(saved.at(-1)?.sessionIds).toEqual({ [`claude|${devRepo}`]: SESSION_ID })
  })

  it('starts with --resume <id> when the saved transcript exists, and hook settings', () => {
    const { service, ptys } = build(({ devRepo, homeDir }) => {
      const folder = join(homeDir, '.claude', 'projects', claudeProjectDirName(devRepo))
      mkdirSync(folder, { recursive: true })
      writeFileSync(join(folder, `${SESSION_ID}.jsonl`), '')
      return { ...terminalState('claude'), sessionIds: { [`claude|${devRepo}`]: SESSION_ID } }
    })
    startHost(service, 'claude')
    const script = ptys.last().launch.args.join(' ')
    expect(script).toContain(`--resume ${SESSION_ID}`)
    expect(script).toContain('--settings')
    expect(ptys.last().options.env).toEqual({ PATH: '', KEEP: 'yes', TERM: 'xterm-256color' })
  })

  it('closing a tab disposes its host: an attached view hears exited, a later start spawns nothing', async () => {
    const { service, ptys } = build(terminalState('claude'))
    const host = service.host('claude')
    host?.start(80, 24)
    const exits = { count: 0 }
    host?.attach(
      () => undefined,
      () => {
        exits.count += 1
      },
    )
    await service.closeTab('claude')
    expect(exits.count).toBe(1)
    expect(() => host?.start(80, 24)).toThrow(WorkspaceStartError)
    expect(ptys.spawned).toHaveLength(1)
  })

  it('a session id that cannot be saved still accepts the hook', async () => {
    const { service, saveFails, devRepo, homeDir } = build(terminalState('claude'))
    startHost(service, 'claude')
    saveFails.value = true
    const folder = join(homeDir, '.claude', 'projects', claudeProjectDirName(devRepo))
    const accepted = await service.onHook('claude', service.hookToken, {
      hook_event_name: 'Stop',
      session_id: SESSION_ID,
      transcript_path: join(folder, `${SESSION_ID}.jsonl`),
    })
    expect(accepted).toBe(true)
  })

  it('SessionEnd and a PTY exit clear the wait', async () => {
    const { service, ptys } = build(terminalState('claude', 'claude~2'))
    const token = service.hookToken
    await service.onHook('claude', token, { hook_event_name: 'Stop' })
    await service.onHook('claude', token, { hook_event_name: 'SessionEnd' })
    startHost(service, 'claude~2')
    await service.onHook('claude~2', token, { hook_event_name: 'Stop' })
    ptys.last().emitExit()
    expect(service.view().sessions.map((session) => session.wait)).toEqual([null, null])
  })

  describe('start and open', () => {
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
      service.configure({ ...DEFAULT_WORKSPACE, devRepoPath: null }, 'x')
      expect(await service.start('MDP-1')).toEqual({
        ok: false,
        error: { code: 'workspaceNotConfigured' },
      })
      expect(git.created).toEqual([])
      expect(git.boardStarts).toEqual([])
    })

    it('an existing worktree is reused and gets no start prompt', async () => {
      const { service, git, ptys, devRepo } = build()
      mkdirSync(join(devRepo, '.claude', 'worktrees', 'MDP-1'), { recursive: true })
      expect(await service.start('MDP-1')).toEqual({ ok: true, warning: null })
      expect(git.created).toEqual([])
      expect(git.boardStarts).toEqual(['MDP-1'])
      startHost(service, 'MDP-1')
      expect(ptys.last().launch.args.join(' ')).not.toContain('ship')
    })

    it('a failed worktree still starts the ticket on the board and queue but opens no tab', async () => {
      const { service, git } = build()
      git.result.value = 'failed'
      expect(await service.start('MDP-1')).toEqual({ ok: false, error: { code: 'worktreeFailed' } })
      expect(git.boardStarts).toEqual(['MDP-1'])
      expect(git.queued).toEqual([['MDP-1']])
      expect(service.view().tabs).toEqual([])
      expect(service.view().starting).toEqual([])
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

    it('the first session runs the start prompt, then resumes after the first hook', async () => {
      const { service, ptys, devRepo, homeDir } = build()
      await service.start('MDP-1')
      startHost(service, 'MDP-1')
      expect(ptys.last().launch.args.join(' ')).toContain("claude 'ship MDP-1'")
      const worktree = join(devRepo, '.claude', 'worktrees', 'MDP-1')
      const folder = join(homeDir, '.claude', 'projects', claudeProjectDirName(worktree))
      mkdirSync(folder, { recursive: true })
      writeFileSync(join(folder, `${SESSION_ID}.jsonl`), '')
      await service.onHook('MDP-1', service.hookToken, {
        hook_event_name: 'UserPromptSubmit',
        session_id: SESSION_ID,
        transcript_path: join(folder, `${SESSION_ID}.jsonl`),
      })
      startHost(service, 'MDP-1')
      const script = ptys.last().launch.args.join(' ')
      expect(script).toContain(`--resume ${SESSION_ID}`)
      expect(script).not.toContain('ship')
    })

    it('open reuses a worktree, asks before recreating a missing one, and never ships', async () => {
      const { service, git, ptys } = build()
      expect(await service.open('MDP-1', false)).toEqual({ ok: false, confirmRecreate: true })
      expect(git.created).toEqual([])
      expect(service.view().tabs).toEqual([])
      expect(await service.open('MDP-1', true)).toEqual({ ok: true, warning: null })
      expect(git.created).toHaveLength(1)
      expect(git.boardStarts).toEqual([])
      startHost(service, 'MDP-1')
      expect(ptys.last().launch.args.join(' ')).not.toContain('ship')
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

  it('shutdown kills every PTY', () => {
    const { service, ptys } = build(terminalState('claude', 'claude~2'))
    startHost(service, 'claude')
    startHost(service, 'claude~2')
    service.shutdown()
    expect(ptys.spawned.map((pty) => pty.killed)).toEqual([true, true])
  })
})

describe('WorkspaceService.prompt', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pastes the line as one block, then sends Enter after the pause', () => {
    vi.useFakeTimers()
    const { service, ptys } = build(terminalState('claude'))
    startHost(service, 'claude')

    expect(service.prompt('claude', 'Read x')).toBe('sent')
    expect(ptys.last().writes).toEqual(['\x1b[200~Read x\x1b[201~'])
    vi.advanceTimersByTime(150)
    expect(ptys.last().writes.at(-1)).toBe('\r')
  })

  it('refuses an unknown or stopped session and one waiting for a permission', async () => {
    const { service, ptys } = build(terminalState('claude'))
    expect(service.prompt('ghost', 'x')).toBe('notFound')
    expect(service.prompt('claude', 'x')).toBe('notRunning')
    startHost(service, 'claude')
    await service.onHook('claude', service.hookToken, {
      hook_event_name: 'Notification',
      notification_type: 'permission_prompt',
    })

    expect(service.prompt('claude', 'x')).toBe('waiting')
    expect(ptys.last().writes).toEqual([])
  })

  it('refuses while claude has ended in the shell, until it starts again', async () => {
    const { service } = build(terminalState('claude'))
    startHost(service, 'claude')
    const token = service.hookToken
    await service.onHook('claude', token, { hook_event_name: 'SessionEnd', reason: 'clear' })
    const afterClear = service.promptState('claude')
    await service.onHook('claude', token, {
      hook_event_name: 'SessionEnd',
      reason: 'prompt_input_exit',
    })
    const afterExit = service.promptState('claude')
    await service.onHook('claude', token, { hook_event_name: 'SessionStart' })

    expect(afterClear).toBe('sent')
    expect(afterExit).toBe('notRunning')
    expect(service.promptState('claude')).toBe('sent')
  })

  it('skips the Enter when a wait appears before the pause ends', async () => {
    vi.useFakeTimers()
    const { service, ptys } = build(terminalState('claude'))
    startHost(service, 'claude')

    service.prompt('claude', 'Read x')
    await service.onHook('claude', service.hookToken, {
      hook_event_name: 'Notification',
      notification_type: 'permission_prompt',
    })
    vi.advanceTimersByTime(150)

    expect(ptys.last().writes).toEqual(['\x1b[200~Read x\x1b[201~'])
  })
})
