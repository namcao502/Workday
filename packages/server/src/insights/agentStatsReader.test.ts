import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claudeProjectDirName } from '@workday/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { AgentStatsReader } from './agentStatsReader.js'
import { AgentStatsStore } from './agentStatsStore.js'

function assistant(id: string, input: number, output: number, at: string, tool?: string): string {
  const block =
    tool === undefined
      ? { type: 'text', text: 'hi' }
      : { type: 'tool_use', id: `t-${id}`, name: tool, input: {} }
  return JSON.stringify({
    type: 'assistant',
    timestamp: at,
    message: {
      id,
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [block],
      usage: { input_tokens: input, output_tokens: output },
    },
  })
}

let root: string
let worktree: string
let projectDirectory: string
let store: AgentStatsStore

beforeEach(() => {
  const base = mkdtempSync(join(tmpdir(), 'workday-reader-'))
  root = join(base, 'projects')
  worktree = join(base, 'repo', '.claude', 'worktrees', 'MDP-1')
  projectDirectory = join(root, claudeProjectDirName(worktree))
  mkdirSync(projectDirectory, { recursive: true })
  mkdirSync(join(base, 'data'))
  store = new AgentStatsStore(join(base, 'data'))
})

function newReader(): AgentStatsReader {
  return new AgentStatsReader({
    projectsRoot: root,
    store,
    worktreePaths: () => Promise.resolve([worktree]),
    timeZone: () => 'Asia/Ho_Chi_Minh',
  })
}

function writeSession(id: string, ...lines: string[]): void {
  writeFileSync(join(projectDirectory, `${id}.jsonl`), lines.map((line) => `${line}\n`).join(''))
}

function subagentFolder(sessionId: string): string {
  const folder = join(projectDirectory, sessionId, 'subagents')
  mkdirSync(folder, { recursive: true })
  return folder
}

describe('AgentStatsReader', () => {
  it('reads one entry per session with its subagents, and saves them', async () => {
    writeSession('s1', assistant('m1', 10, 5, '2026-10-22T06:00:00Z'))
    writeSession('s2', assistant('m2', 20, 7, '2026-10-22T07:00:00Z'))
    writeFileSync(
      join(subagentFolder('s2'), 'agent-a1.jsonl'),
      `${assistant('a1', 3, 40, '2026-10-22T07:00:30Z')}\n`,
    )

    const sessions = await newReader().readAndSave('MDP-1')

    expect(sessions).toHaveLength(2)
    const second = sessions.find((session) => session.inputTokens === 20)
    expect(second?.subagents).toHaveLength(1)
    expect(second?.sessions).toBe(1)
    expect(Object.keys(store.sessions('MDP-1')).sort()).toEqual(['s1', 's2'])
  })

  it('gives no sessions when there is no transcript', async () => {
    expect(await newReader().readAndSave('MDP-1')).toEqual([])
  })

  it('fills subagents from their meta, unknown when there is none, and adds their tools', async () => {
    writeSession('s1', assistant('m1', 10, 5, '2026-10-22T06:00:00Z', 'Task'))
    const folder = subagentFolder('s1')
    writeFileSync(
      join(folder, 'agent-a1.jsonl'),
      `${assistant('a1', 3, 40, '2026-10-22T06:00:30Z', 'Read')}\n${assistant('a2', 3, 60, '2026-10-22T06:00:40Z', 'Bash')}\n`,
    )
    writeFileSync(
      join(folder, 'agent-a1.meta.json'),
      '{"agentType":"general-purpose","description":"Plan review","model":"sonnet","finished":true}',
    )
    writeFileSync(
      join(folder, 'agent-b2.jsonl'),
      `${assistant('b1', 1, 2, '2026-10-22T06:00:50Z')}\n`,
    )

    const [session] = await newReader().readAndSave('MDP-1')

    expect(session?.subagents).toEqual([
      {
        startedAt: '2026-10-22T06:00:30.000Z',
        agentType: 'general-purpose',
        description: 'Plan review',
        model: 'sonnet',
        isFinished: true,
        toolCalls: 2,
        outputTokens: 100,
      },
      {
        startedAt: '2026-10-22T06:00:50.000Z',
        agentType: '?',
        description: '?',
        model: null,
        isFinished: false,
        toolCalls: 0,
        outputTokens: 2,
      },
    ])
    expect(session?.tools['Read']?.calls).toBe(1)
    expect(session?.tools['Task']?.calls).toBe(1)
    expect(session?.lastActivity).toBe('2026-10-22T06:00:50.000Z')
  })

  it('keeps a saved session whose transcript is gone', async () => {
    writeSession('s1', assistant('m1', 10, 5, '2026-10-22T06:00:00Z'))
    await newReader().readAndSave('MDP-1')
    writeSession('s2', assistant('m2', 20, 7, '2026-10-22T07:00:00Z'))

    const sessions = await newReader().readAndSave('MDP-1')

    expect(sessions.map((session) => session.inputTokens).sort()).toEqual([10, 20])
  })
})
