export type WaitReason = 'finished' | 'permission' | 'question'

export interface HookEvent {
  readonly eventName: string
  readonly toolName: string | null
  readonly notificationType: string | null
  readonly agentId: string | null
  readonly sessionId: string | null
  readonly subagentsRunning: boolean
  readonly transcriptPath: string | null
  readonly reason: string | null
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(source: Readonly<Record<string, unknown>>, name: string): string | null {
  const value = source[name]
  return typeof value === 'string' ? value : null
}

// Null for anything that is not an object with a non-empty string hook_event_name.
export function parseHookEvent(payload: unknown): HookEvent | null {
  if (!isRecord(payload)) {
    return null
  }
  const eventName = readString(payload, 'hook_event_name')
  if (eventName === null || eventName === '') {
    return null
  }
  const tasks = payload['background_tasks']
  const subagentsRunning =
    Array.isArray(tasks) &&
    tasks.some(
      (task: unknown) =>
        isRecord(task) && readString(task, 'type') === 'subagent' && readString(task, 'status') === 'running',
    )
  return {
    eventName,
    toolName: readString(payload, 'tool_name'),
    notificationType: readString(payload, 'notification_type'),
    agentId: readString(payload, 'agent_id'),
    sessionId: readString(payload, 'session_id'),
    subagentsRunning,
    transcriptPath: readString(payload, 'transcript_path'),
    reason: readString(payload, 'reason'),
  }
}

// A subagent's tool call never ends the main turn's wait, except a permission wait (the user probably approved it).
export function nextWait(current: WaitReason | null, event: HookEvent): WaitReason | null {
  const isToolEvent = event.eventName === 'PreToolUse' || event.eventName === 'PostToolUse'
  if (isToolEvent && event.agentId !== null && event.agentId !== '') {
    return current === 'permission' ? null : current
  }
  switch (event.eventName) {
    case 'UserPromptSubmit':
    case 'PostToolUse':
    case 'SessionEnd':
      return null
    case 'PreToolUse':
      return event.toolName === 'AskUserQuestion' ? 'question' : null
    // A Stop that only waits for background subagents is not the end; the Stop after they finish is.
    case 'Stop':
      return event.subagentsRunning ? current : 'finished'
    case 'Notification':
      return notificationWait(current, event.notificationType)
    default:
      return current
  }
}

function notificationWait(current: WaitReason | null, type: string | null): WaitReason | null {
  switch (type) {
    // AskUserQuestion is drawn as a permission dialog, so its prompt stays a question.
    case 'permission_prompt':
      return current === 'question' ? current : 'permission'
    case 'worker_permission_prompt':
      return 'permission'
    case 'elicitation_dialog':
    case 'elicitation_url_dialog':
    case 'agent_needs_input':
      return 'question'
    default:
      return current
  }
}

// Esc cancels a permission or question dialog and claude sends no hook for that; a finished turn stays.
export function afterEscape(current: WaitReason | null): WaitReason | null {
  return current === 'permission' || current === 'question' ? null : current
}

// Looking at a finished turn is enough; a permission or question still blocks claude.
export function clearsWhenSeen(reason: WaitReason): boolean {
  return reason === 'finished'
}

// Working from the prompt until Stop; a wait (Notification) or the end of the session is not working.
export function workingAfter(eventName: string, isWorking: boolean): boolean {
  switch (eventName) {
    case 'UserPromptSubmit':
    case 'PreToolUse':
    case 'PostToolUse':
      return true
    case 'Stop':
    case 'Notification':
    case 'SessionEnd':
      return false
    default:
      return isWorking
  }
}
