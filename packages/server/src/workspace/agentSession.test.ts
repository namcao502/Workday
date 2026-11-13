import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentMode } from '@workday/core'
import { describe, expect, it } from 'vitest'
import { FakeClaudeAgent } from '../testing/fakeAgent.js'
import { AgentSession, type AgentSessionDeps, type SessionDirectory } from './agentSession.js'
import { WorkspaceStartError } from './workspaceStartError.js'

interface Built {
  readonly session: AgentSession
  readonly agent: FakeClaudeAgent
  readonly counts: { attention: number; change: number }
  readonly savedIds: string[]
}

function build(overrides: Partial<AgentSessionDeps> = {}): Built {
  const agent = new FakeClaudeAgent()
  const counts = { attention: 0, change: 0 }
  const savedIds: string[] = []
  const session = new AgentSession({
    name: 'claude',
    agent,
    directory: (): SessionDirectory => ({ path: tmpdir(), fallback: null }),
    resumeId: () => null,
    continueLatest: () => false,
    mode: (): AgentMode => 'default',
    onChange: () => {
      counts.change += 1
    },
    onAttention: () => {
      counts.attention += 1
    },
    onSessionId: (_cwd, sessionId) => {
      savedIds.push(sessionId)
    },
    ...overrides,
  })
  return { session, agent, counts, savedIds }
}

describe('AgentSession', () => {
  it('the first send starts the agent in the session folder and later sends reuse it', () => {
    const folder = mkdtempSync(join(tmpdir(), 'agent-'))
    const { session, agent, counts } = build({
      directory: () => ({ path: folder, fallback: null }),
    })
    session.send('one')
    session.send('two')
    expect(agent.handles).toHaveLength(1)
    expect(agent.last().options.cwd).toBe(folder)
    expect(agent.last().sent).toEqual(['one', 'two'])
    expect(session.state).toMatchObject({ running: true, working: true, cwd: folder })
    expect(counts.attention).toBe(1)
  })

  it('a saved session id resumes, otherwise the main ticket session continues the latest', () => {
    const saved = build({ resumeId: () => 'saved-id', continueLatest: () => true })
    saved.session.send('hi')
    expect(saved.agent.last().options).toMatchObject({ resume: 'saved-id', continueLatest: false })

    const latest = build({ continueLatest: () => true })
    latest.session.send('hi')
    expect(latest.agent.last().options).toMatchObject({ resume: null, continueLatest: true })
  })

  it('a missing worktree throws worktreeMissing and starts nothing', () => {
    const missing = join(tmpdir(), 'agent-missing-worktree')
    const { session, agent } = build({ directory: () => ({ path: missing, fallback: null }) })
    expect(() => {
      session.send('hi')
    }).toThrow(new WorkspaceStartError('worktreeMissing'))
    expect(agent.handles).toHaveLength(0)
    expect(session.state.running).toBe(false)
  })

  it('a tool call becomes a request, and answering it resolves the agent call and clears it', async () => {
    const { session, agent, counts } = build()
    session.send('hi')
    const attention = counts.attention
    const { call, decision } = agent.last().toolCall('Bash', { command: 'ls' }, true)
    expect(session.state.requests).toMatchObject([
      { id: call.id, kind: 'permission', detail: 'ls' },
    ])
    expect(counts.attention).toBe(attention + 1)
    expect(session.answer('nope', { kind: 'allow', always: false })).toBe('notFound')
    expect(session.answer(call.id, { kind: 'allow', always: true })).toBe('ok')
    await expect(decision).resolves.toEqual({ kind: 'allow', always: true })
    expect(session.state.requests).toEqual([])
  })

  it('a wrong-kind answer is invalid and keeps the request open', () => {
    const { session, agent } = build()
    session.send('hi')
    const { call } = agent.last().toolCall('ExitPlanMode', { plan: 'Plan' })
    expect(session.answer(call.id, { kind: 'allow', always: false })).toBe('invalid')
    expect(session.state.requests).toHaveLength(1)
  })

  it('turnEnded clears working and sets finished until seen', () => {
    const { session, agent } = build()
    session.send('hi')
    agent.last().emit({ type: 'turnEnded', ok: true })
    expect(session.state).toMatchObject({ running: true, working: false, finished: true })
    session.seen()
    expect(session.state.finished).toBe(false)
  })

  it('exited denies open requests and the next send starts a new process', async () => {
    const { session, agent, savedIds } = build()
    session.send('hi')
    agent.last().emit({ type: 'init', sessionId: 's-1', model: 'opus', mode: 'plan' })
    expect(savedIds).toEqual(['s-1'])
    expect(session.state).toMatchObject({ sessionId: 's-1', model: 'opus', mode: 'plan' })
    const { decision } = agent.last().toolCall('Bash', { command: 'ls' })
    agent.last().emit({ type: 'exited', error: null })
    await expect(decision).resolves.toEqual({ kind: 'deny', message: 'Session ended.' })
    expect(session.state).toMatchObject({ running: false, working: false, requests: [] })
    session.send('again')
    expect(agent.handles).toHaveLength(2)
    expect(agent.last().sent).toEqual(['again'])
  })

  it('dispose closes the agent and refuses later sends', async () => {
    const { session, agent } = build()
    session.send('hi')
    const { decision } = agent.last().toolCall('Bash', { command: 'ls' })
    session.dispose()
    expect(agent.last().closed).toBe(true)
    await expect(decision).resolves.toMatchObject({ kind: 'deny' })
    expect(() => {
      session.send('again')
    }).toThrow(new WorkspaceStartError('sessionNotFound'))
    expect(agent.handles).toHaveLength(1)
  })

  it('setMode before the first start is used by the start; while running it calls the handle', async () => {
    const { session, agent } = build()
    await session.setMode('acceptEdits')
    expect(session.state.mode).toBe('acceptEdits')
    session.send('hi')
    expect(agent.last().options.mode).toBe('acceptEdits')
    await session.setMode('plan')
    expect(agent.last().modes).toEqual(['plan'])
    expect(session.state.mode).toBe('plan')
  })
})
