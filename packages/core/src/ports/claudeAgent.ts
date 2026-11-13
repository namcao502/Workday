export type AgentMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'

export interface AgentToolCall {
  readonly id: string // unique per request, made by the adapter
  readonly toolName: string
  readonly input: Readonly<Record<string, unknown>>
  readonly canAlwaysAllow: boolean // the SDK sent permission suggestions
}

export type AgentDecision =
  | {
      readonly kind: 'allow'
      readonly updatedInput?: Readonly<Record<string, unknown>>
      readonly always?: boolean
    }
  | { readonly kind: 'deny'; readonly message: string }

export type AgentEvent =
  | {
      readonly type: 'init'
      readonly sessionId: string
      readonly model: string
      readonly mode: AgentMode
    }
  | { readonly type: 'message' } // something was written to the transcript
  | { readonly type: 'mode'; readonly mode: AgentMode }
  | { readonly type: 'turnEnded'; readonly ok: boolean }
  | { readonly type: 'exited'; readonly error: string | null }

// The part of AbortSignal the port uses; core builds without DOM or Node types.
export interface AbortSignalLike {
  readonly aborted: boolean
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void
}

export interface AgentStartOptions {
  readonly cwd: string
  readonly mode: AgentMode
  readonly resume: string | null // session id
  readonly continueLatest: boolean
  readonly onEvent: (event: AgentEvent) => void
  // Resolves when the user answers; the adapter denies open calls on close.
  // `signal` aborts when the SDK drops the call.
  readonly onToolCall: (call: AgentToolCall, signal: AbortSignalLike) => Promise<AgentDecision>
}

export interface AgentSessionHandle {
  send(text: string): void
  interrupt(): Promise<void>
  setMode(mode: AgentMode): Promise<void>
  close(): void
}

export interface ClaudeAgent {
  start(options: AgentStartOptions): AgentSessionHandle
}
