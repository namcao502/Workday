import { randomUUID } from 'node:crypto'
import {
  query,
  type CanUseTool,
  type PermissionMode,
  type PermissionResult,
  type PermissionUpdate,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import type {
  AgentDecision,
  AgentEvent,
  AgentMode,
  AgentSessionHandle,
  AgentStartOptions,
  ClaudeAgent,
} from '@workday/core'

export interface SdkAgentDeps {
  readonly executable: () => string // pathToClaudeCodeExecutable, read at each start
  readonly env: () => Readonly<Record<string, string>>
  readonly logError: (message: string, error: unknown) => void
}

interface PromptQueue {
  readonly push: (text: string) => void
  readonly end: () => void
  readonly messages: AsyncIterable<SDKUserMessage>
}

const AGENT_MODES: ReadonlySet<string> = new Set([
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
])
const SESSION_ENDED: AgentDecision = { kind: 'deny', message: 'Session ended.' }

function isAgentMode(mode: PermissionMode): mode is AgentMode {
  return AGENT_MODES.has(mode)
}

function toAgentMode(mode: PermissionMode): AgentMode | null {
  return isAgentMode(mode) ? mode : null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Prompts sent before the SDK first pulls wait in the buffer, each yielded exactly once.
function createPromptQueue(): PromptQueue {
  let buffer: readonly SDKUserMessage[] = []
  let ended = false
  let wake: (() => void) | null = null
  const notify = (): void => {
    const resolve = wake
    wake = null
    resolve?.()
  }
  async function* generate(): AsyncGenerator<SDKUserMessage, void> {
    for (;;) {
      const [next, ...rest] = buffer
      if (next !== undefined) {
        buffer = rest
        yield next
      } else if (ended) {
        return
      } else {
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }
    }
  }
  return {
    push: (text) => {
      const message: SDKUserMessage = {
        type: 'user',
        message: { role: 'user', content: text },
        parent_tool_use_id: null,
        session_id: '',
      }
      buffer = [...buffer, message]
      notify()
    },
    end: () => {
      ended = true
      notify()
    },
    messages: generate(),
  }
}

function toEvent(message: SDKMessage, startMode: AgentMode): AgentEvent | null {
  if (message.type === 'system' && message.subtype === 'init') {
    const mode = toAgentMode(message.permissionMode) ?? startMode
    return { type: 'init', sessionId: message.session_id, model: message.model, mode }
  }
  if (
    message.type === 'system' &&
    message.subtype === 'status' &&
    message.permissionMode !== undefined
  ) {
    const mode = toAgentMode(message.permissionMode)
    return mode === null ? null : { type: 'mode', mode }
  }
  if (message.type === 'result') {
    return { type: 'turnEnded', ok: message.subtype === 'success' }
  }
  if (message.type === 'user' || message.type === 'assistant' || message.type === 'system') {
    return { type: 'message' }
  }
  return null
}

function toPermissionResult(
  decision: AgentDecision,
  input: Record<string, unknown>,
  suggestions: PermissionUpdate[] | undefined,
): PermissionResult {
  if (decision.kind === 'deny') {
    return { behavior: 'deny', message: decision.message }
  }
  // The SDK requires the input on allow, so an unchanged call echoes it back.
  const updatedInput = { ...(decision.updatedInput ?? input) }
  if (decision.always === true && suggestions !== undefined) {
    return { behavior: 'allow', updatedInput, updatedPermissions: suggestions }
  }
  return { behavior: 'allow', updatedInput }
}

function start(deps: SdkAgentDeps, options: AgentStartOptions): AgentSessionHandle {
  const prompts = createPromptQueue()
  // Settles every SDK permission call still open once the session closes or exits.
  let endSession: (decision: AgentDecision) => void = () => undefined
  const ended = new Promise<AgentDecision>((resolve) => {
    endSession = resolve
  })
  let closed = false

  const canUseTool: CanUseTool = async (toolName, input, { signal, suggestions }) => {
    const call = {
      id: randomUUID(),
      toolName,
      input,
      canAlwaysAllow: suggestions !== undefined && suggestions.length !== 0,
    }
    const decision = await Promise.race([options.onToolCall(call, signal), ended])
    return toPermissionResult(decision, input, suggestions)
  }

  const session = query({
    prompt: prompts.messages,
    options: {
      cwd: options.cwd,
      permissionMode: options.mode,
      allowDangerouslySkipPermissions: options.mode === 'bypassPermissions',
      pathToClaudeCodeExecutable: deps.executable(),
      env: { ...deps.env() },
      settingSources: ['user', 'project', 'local'],
      ...(options.resume === null ? {} : { resume: options.resume }),
      continue: options.continueLatest,
      canUseTool,
      stderr: (data) => {
        deps.logError('Claude stderr', data)
      },
    },
  })

  const run = async (): Promise<void> => {
    let error: string | null = null
    try {
      for await (const message of session) {
        const event = toEvent(message, options.mode)
        if (event !== null) {
          options.onEvent(event)
        }
      }
    } catch (caught: unknown) {
      if (!closed) {
        deps.logError('Claude session failed', caught)
        error = errorMessage(caught)
      }
    } finally {
      prompts.end()
      endSession(SESSION_ENDED)
    }
    options.onEvent({ type: 'exited', error })
  }
  void run()

  return {
    send: (text) => {
      prompts.push(text)
    },
    interrupt: async () => {
      await session.interrupt()
    },
    setMode: async (mode) => {
      await session.setPermissionMode(mode)
    },
    close: () => {
      closed = true
      prompts.end()
      endSession(SESSION_ENDED)
      session.close()
    },
  }
}

export function createSdkAgent(deps: SdkAgentDeps): ClaudeAgent {
  return { start: (options) => start(deps, options) }
}
