import type {
  AgentDecision,
  AgentEvent,
  AgentMode,
  AgentSessionHandle,
  AgentStartOptions,
  AgentToolCall,
  ClaudeAgent,
} from '@workday/core'

export interface FakeToolCall {
  readonly decision: Promise<AgentDecision>
  readonly abort: () => void
}

export class FakeAgentHandle implements AgentSessionHandle {
  readonly sent: string[] = []
  readonly modes: AgentMode[] = []
  interrupts = 0
  closed = false
  private nextCallId = 1

  constructor(readonly options: AgentStartOptions) {}

  send(text: string): void {
    this.sent.push(text)
  }

  interrupt(): Promise<void> {
    this.interrupts += 1
    return Promise.resolve()
  }

  setMode(mode: AgentMode): Promise<void> {
    this.modes.push(mode)
    return Promise.resolve()
  }

  close(): void {
    this.closed = true
  }

  emit(event: AgentEvent): void {
    this.options.onEvent(event)
  }

  toolCall(
    toolName: string,
    input: Readonly<Record<string, unknown>> = {},
    canAlwaysAllow = false,
  ): FakeToolCall & { readonly call: AgentToolCall } {
    const call: AgentToolCall = {
      id: `call-${String(this.nextCallId)}`,
      toolName,
      input,
      canAlwaysAllow,
    }
    this.nextCallId += 1
    const controller = new AbortController()
    const decision = this.options.onToolCall(call, controller.signal)
    return {
      call,
      decision,
      abort: () => {
        controller.abort()
      },
    }
  }
}

// Records every start; nothing real is ever run.
export class FakeClaudeAgent implements ClaudeAgent {
  readonly handles: FakeAgentHandle[] = []

  readonly start = (options: AgentStartOptions): AgentSessionHandle => {
    const handle = new FakeAgentHandle(options)
    this.handles.push(handle)
    return handle
  }

  last(): FakeAgentHandle {
    const handle = this.handles.at(-1)
    if (handle === undefined) {
      throw new Error('No agent started')
    }
    return handle
  }
}
