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
  // queued: prompts the SDK still holds; sends merged into the ended turn are not counted. Absent on older CLIs.
  | { readonly type: 'turnEnded'; readonly ok: boolean; readonly queued?: number | undefined }
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
  readonly model: string | null // chosen while stopped; null keeps Claude's default
  readonly onEvent: (event: AgentEvent) => void
  // Resolves when the user answers; the adapter denies open calls on close.
  // `signal` aborts when the SDK drops the call.
  readonly onToolCall: (call: AgentToolCall, signal: AbortSignalLike) => Promise<AgentDecision>
}

export interface UsageWindow {
  readonly percent: number // 0-100 of the window used
  readonly resetsAt: string | null // ISO 8601
}

// What the status line under the chat shows: the context window and the plan usage.
export interface AgentUsage {
  readonly contextPercent: number | null
  readonly usage: UsageWindow | null // the plan's weekly window, what the terminal calls Usage
}

export interface AgentModel {
  readonly value: string // what setModel takes
  readonly label: string
}

export interface AgentCommand {
  readonly name: string // without the leading slash
  readonly description: string
  readonly hint: string // argument hint, e.g. "<file>"; empty when none
}

// What a live session offers: the models to switch to and the slash commands to type.
export interface AgentCatalog {
  readonly models: readonly AgentModel[]
  readonly commands: readonly AgentCommand[]
}

export type AgentImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

export interface AgentImage {
  readonly mediaType: AgentImageType
  readonly data: string // base64
}

// A file rewind, or the preview of one (dryRun).
export interface AgentRewind {
  readonly canRewind: boolean
  readonly error: string | null
  readonly files: number
  readonly insertions: number
  readonly deletions: number
}

export interface AgentSessionHandle {
  send(text: string, images?: readonly AgentImage[]): void
  usage(): Promise<AgentUsage>
  catalog(): Promise<AgentCatalog>
  setModel(model: string): Promise<void>
  // Puts the files back to how they were when the user message with this id was sent.
  rewind(messageId: string, dryRun: boolean): Promise<AgentRewind>
  interrupt(): Promise<void>
  setMode(mode: AgentMode): Promise<void>
  close(): void
}

export interface ClaudeAgent {
  start(options: AgentStartOptions): AgentSessionHandle
}
