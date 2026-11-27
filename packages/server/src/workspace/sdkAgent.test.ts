import {
  query,
  type CanUseTool,
  type Options,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import type { AgentDecision, AgentEvent, AgentStartOptions } from '@workday/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSdkAgent, toEvent } from './sdkAgent.js'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }))

type Item = Record<string, unknown> | Error | null

// The SDK's Query: messages the test pushes, then an end (null) or a failure; the control calls are spies.
interface FakeQuery {
  readonly add: (item: Item) => void
  readonly session: Query
  readonly interrupt: ReturnType<typeof vi.fn>
  readonly setModel: ReturnType<typeof vi.fn>
  readonly setPermissionMode: ReturnType<typeof vi.fn>
}

function fakeQuery(): FakeQuery {
  let buffer: readonly Item[] = []
  let wake: (() => void) | null = null
  const add = (item: Item): void => {
    buffer = [...buffer, item]
    const resolve = wake
    wake = null
    resolve?.()
  }
  async function* messages(): AsyncGenerator<SDKMessage, void> {
    for (;;) {
      const [next, ...rest] = buffer
      if (next === undefined) {
        await new Promise<void>((resolve) => {
          wake = resolve
        })
        continue
      }
      buffer = rest
      if (next === null) {
        return
      }
      if (next instanceof Error) {
        throw next
      }
      yield next as unknown as SDKMessage
    }
  }
  const interrupt = vi.fn(() => Promise.resolve())
  const setModel = vi.fn(() => Promise.resolve())
  const setPermissionMode = vi.fn(() => Promise.resolve())
  const session = Object.assign(messages(), {
    interrupt,
    close: vi.fn(() => {
      add(null)
    }),
    setModel,
    setPermissionMode,
    getContextUsage: vi.fn(() => Promise.resolve({ percentage: 42 })),
    usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: vi.fn(() =>
      Promise.resolve({
        rate_limits: { seven_day: { utilization: 30, resets_at: '2026-12-01' } },
      }),
    ),
    supportedModels: vi.fn(() => Promise.resolve([{ value: 'opus', displayName: 'Opus' }])),
    supportedCommands: vi.fn(() =>
      Promise.resolve([{ name: 'plan', description: 'Plan it', argumentHint: '<task>' }]),
    ),
    rewindFiles: vi.fn(() =>
      Promise.resolve({ canRewind: true, filesChanged: ['a', 'b'], insertions: 3, deletions: 1 }),
    ),
  })
  return { add, session: session as unknown as Query, interrupt, setModel, setPermissionMode }
}

interface Started {
  readonly fake: FakeQuery
  readonly events: AgentEvent[]
  readonly options: () => Options
  readonly prompt: () => AsyncIterable<SDKUserMessage>
  readonly logError: ReturnType<typeof vi.fn>
  readonly handle: ReturnType<ReturnType<typeof createSdkAgent>['start']>
}

function start(
  overrides: Partial<AgentStartOptions> = {},
  onToolCall: AgentStartOptions['onToolCall'] = () => Promise.resolve({ kind: 'allow' }),
): Started {
  const fake = fakeQuery()
  vi.mocked(query).mockReturnValue(fake.session)
  const events: AgentEvent[] = []
  const logError = vi.fn()
  const agent = createSdkAgent({
    executable: () => 'C:/claude.exe',
    env: () => ({ CLAUDE_X: '1' }),
    logError,
    additionalDirectories: ['C:/data/tmp'],
  })
  const handle = agent.start({
    cwd: 'C:/repo',
    mode: 'default',
    resume: null,
    continueLatest: false,
    model: null,
    onEvent: (event) => {
      events.push(event)
    },
    onToolCall,
    ...overrides,
  })
  const call = (): Parameters<typeof query>[0] => {
    const first = vi.mocked(query).mock.calls.at(-1)?.[0]
    if (first === undefined) {
      throw new Error('query was not called')
    }
    return first
  }
  return {
    fake,
    events,
    options: () => call().options ?? {},
    prompt: () => call().prompt as AsyncIterable<SDKUserMessage>,
    logError,
    handle,
  }
}

function canUseTool(started: Started): CanUseTool {
  const tool = started.options().canUseTool
  if (tool === undefined) {
    throw new Error('no canUseTool')
  }
  return tool
}

const TOOL_CONTEXT = { signal: new AbortController().signal, toolUseID: 't-1', requestId: 'r-1' }

function contentOf(result: IteratorResult<SDKUserMessage>): unknown {
  if (result.done === true) {
    return undefined
  }
  const message: SDKUserMessage = result.value
  return message.message.content
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  vi.mocked(query).mockReset()
})

describe('toEvent', () => {
  it('turns the background task list into descriptions, leaving ambient watchers out', () => {
    const message = {
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks: [
        {
          task_id: 't1',
          task_type: 'local_agent',
          description: 'Independent plan review: plan.md',
        },
        { task_id: 't2', task_type: 'monitor', description: 'watch logs', ambient: true },
      ],
      uuid: '00000000-0000-0000-0000-000000000000',
      session_id: 's-1',
    } as unknown as SDKMessage
    expect(toEvent(message, 'default')).toEqual({
      type: 'backgroundTasks',
      tasks: ['Independent plan review: plan.md'],
    })
  })
})

describe('createSdkAgent', () => {
  it('starts the SDK with the session options', () => {
    const started = start({ mode: 'bypassPermissions', resume: 's-9', model: 'opus' })
    expect(started.options()).toMatchObject({
      cwd: 'C:/repo',
      additionalDirectories: ['C:/data/tmp'],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      pathToClaudeCodeExecutable: 'C:/claude.exe',
      env: { CLAUDE_X: '1' },
      resume: 's-9',
      model: 'opus',
      continue: false,
    })
    const plain = start()
    expect(plain.options()).not.toHaveProperty('resume')
    expect(plain.options()).not.toHaveProperty('model')
    expect(plain.options().allowDangerouslySkipPermissions).toBe(false)
  })

  it('turns SDK messages into events and says when the session exits', async () => {
    const started = start()
    started.fake.add({
      type: 'system',
      subtype: 'init',
      session_id: 's-1',
      model: 'opus',
      permissionMode: 'acceptEdits',
    })
    started.fake.add({ type: 'assistant' })
    started.fake.add({ type: 'result', subtype: 'success', queued_turn_count: 0 })
    started.fake.add(null)
    await settle()
    expect(started.events).toEqual([
      { type: 'init', sessionId: 's-1', model: 'opus', mode: 'acceptEdits' },
      { type: 'message' },
      { type: 'turnEnded', ok: true, queued: 0 },
      { type: 'exited', error: null },
    ])
  })

  it('a failing stream is logged and ends with its error; a closed one ends quietly', async () => {
    const failing = start()
    failing.fake.add(new Error('boom'))
    await settle()
    expect(failing.events).toEqual([{ type: 'exited', error: 'boom' }])
    expect(failing.logError).toHaveBeenCalledWith('Claude session failed', expect.any(Error))

    const closed = start()
    closed.handle.close()
    await settle()
    expect(closed.events).toEqual([{ type: 'exited', error: null }])
    expect(closed.logError).not.toHaveBeenCalled()
  })

  it('sends a prompt as text, and images before the text', async () => {
    const started = start()
    const prompts = started.prompt()[Symbol.asyncIterator]()
    started.handle.send('hello')
    started.handle.send('look', [{ mediaType: 'image/png', data: 'AAA' }])
    expect(contentOf(await prompts.next())).toBe('hello')
    expect(contentOf(await prompts.next())).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
      { type: 'text', text: 'look' },
    ])
    started.handle.close()
    expect((await prompts.next()).done).toBe(true)
  })

  it('asks for each tool call and maps the answer for the SDK', async () => {
    const answers: readonly AgentDecision[] = [
      { kind: 'allow' },
      { kind: 'allow', always: true, updatedInput: { command: 'ls -la' } },
      { kind: 'deny', message: 'No.' },
    ]
    const calls: unknown[] = []
    const started = start({}, (call) => {
      calls.push(call)
      return Promise.resolve(answers[calls.length - 1] ?? { kind: 'allow' })
    })
    const tool = canUseTool(started)
    const suggestions = [
      { type: 'setMode' as const, mode: 'acceptEdits' as const, destination: 'session' as const },
    ]
    expect(await tool('Bash', { command: 'ls' }, TOOL_CONTEXT)).toEqual({
      behavior: 'allow',
      updatedInput: { command: 'ls' },
    })
    expect(await tool('Bash', { command: 'ls' }, { ...TOOL_CONTEXT, suggestions })).toEqual({
      behavior: 'allow',
      updatedInput: { command: 'ls -la' },
      updatedPermissions: suggestions,
    })
    expect(await tool('Bash', { command: 'rm' }, TOOL_CONTEXT)).toEqual({
      behavior: 'deny',
      message: 'No.',
    })
    expect(calls[0]).toMatchObject({ toolName: 'Bash', canAlwaysAllow: false })
    expect(calls[1]).toMatchObject({ toolName: 'Bash', canAlwaysAllow: true })
  })

  it('a tool call still open when the session closes is denied', async () => {
    const started = start({}, () => new Promise<AgentDecision>(() => undefined))
    const pending = canUseTool(started)('Bash', { command: 'ls' }, TOOL_CONTEXT)
    started.handle.close()
    expect(await pending).toEqual({ behavior: 'deny', message: 'Session ended.' })
  })

  it('reads usage, the catalog and a rewind, and forwards the controls', async () => {
    const started = start()
    expect(await started.handle.usage()).toEqual({
      contextPercent: 42,
      usage: { percent: 30, resetsAt: '2026-12-01' },
    })
    expect(await started.handle.catalog()).toEqual({
      models: [{ value: 'opus', label: 'Opus' }],
      commands: [{ name: 'plan', description: 'Plan it', hint: '<task>' }],
    })
    expect(await started.handle.rewind('m-1', true)).toEqual({
      canRewind: true,
      error: null,
      files: 2,
      insertions: 3,
      deletions: 1,
    })
    await started.handle.interrupt()
    await started.handle.setModel('sonnet')
    await started.handle.setMode('plan')
    expect(started.fake.interrupt).toHaveBeenCalled()
    expect(started.fake.setModel).toHaveBeenCalledWith('sonnet')
    expect(started.fake.setPermissionMode).toHaveBeenCalledWith('plan')
  })
})
