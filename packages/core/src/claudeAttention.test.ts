import { describe, expect, it } from 'vitest'
import {
  afterEscape,
  clearsWhenSeen,
  nextWait,
  parseHookEvent,
  workingAfter,
  type HookEvent,
  type WaitReason,
} from './claudeAttention.js'

function event(partial: Partial<HookEvent> & { eventName: string }): HookEvent {
  return {
    toolName: null,
    notificationType: null,
    agentId: null,
    sessionId: null,
    subagentsRunning: false,
    transcriptPath: null,
    reason: null,
    ...partial,
  }
}

describe('parseHookEvent', () => {
  it('reads the fields the app uses', () => {
    const parsed = parseHookEvent({
      session_id: 'abc',
      transcript_path: 'C:\\x\\abc.jsonl',
      hook_event_name: 'Stop',
      tool_name: 'Bash',
      notification_type: 'idle_prompt',
      agent_id: 'agent-1',
      reason: 'prompt_input_exit',
    })
    expect(parsed).toEqual({
      eventName: 'Stop',
      toolName: 'Bash',
      notificationType: 'idle_prompt',
      agentId: 'agent-1',
      sessionId: 'abc',
      subagentsRunning: false,
      transcriptPath: 'C:\\x\\abc.jsonl',
      reason: 'prompt_input_exit',
    })
  })

  it.each([null, 'text', 5, [], {}, { hook_event_name: 5 }, { hook_event_name: '' }])(
    'returns null for %j',
    (payload) => {
      expect(parseHookEvent(payload)).toBeNull()
    },
  )

  it.each([
    [[{ id: 'a1', type: 'subagent', status: 'running' }], true],
    [
      [
        { type: 'shell', status: 'running' },
        { type: 'subagent', status: 'running' },
      ],
      true,
    ],
    [[{ type: 'shell', status: 'running', command: 'sleep 15' }], false],
    [[{ type: 'subagent', status: 'completed' }], false],
    [[], false],
    [null, false],
  ])('reads background_tasks %j as subagentsRunning %s', (tasks, expected) => {
    const parsed = parseHookEvent({ hook_event_name: 'Stop', background_tasks: tasks })
    expect(parsed?.subagentsRunning).toBe(expected)
  })
})

describe('nextWait', () => {
  const cases: readonly (readonly [WaitReason | null, string, string | null, string | null, WaitReason | null])[] = [
    [null, 'Stop', null, null, 'finished'],
    [null, 'Notification', null, 'permission_prompt', 'permission'],
    ['finished', 'Notification', null, 'permission_prompt', 'permission'],
    ['question', 'Notification', null, 'permission_prompt', 'question'],
    [null, 'Notification', null, 'worker_permission_prompt', 'permission'],
    [null, 'Notification', null, 'elicitation_dialog', 'question'],
    [null, 'Notification', null, 'elicitation_url_dialog', 'question'],
    [null, 'Notification', null, 'agent_needs_input', 'question'],
    ['finished', 'Notification', null, 'idle_prompt', 'finished'],
    [null, 'Notification', null, 'idle_prompt', null],
    ['finished', 'Notification', null, 'auth_success', 'finished'],
    [null, 'PreToolUse', 'AskUserQuestion', null, 'question'],
    ['finished', 'PreToolUse', 'Bash', null, null],
    ['permission', 'PostToolUse', 'Bash', null, null],
    ['question', 'PostToolUse', 'AskUserQuestion', null, null],
    ['permission', 'Stop', null, null, 'finished'],
    ['finished', 'UserPromptSubmit', null, null, null],
    ['finished', 'SubagentStop', null, null, 'finished'],
    ['finished', 'SessionEnd', null, null, null],
    ['permission', 'SessionEnd', null, null, null],
    ['question', 'SessionEnd', null, null, null],
  ]

  it.each(cases)('%s + %s/%s/%s -> %s', (current, eventName, toolName, notificationType, expected) => {
    expect(nextWait(current, event({ eventName, toolName, notificationType }))).toBe(expected)
  })

  it.each([
    ['PreToolUse', 'finished'],
    ['PostToolUse', 'finished'],
    ['PreToolUse', 'question'],
    ['PostToolUse', 'question'],
  ] as const)('keeps %s wait %s when a subagent uses a tool', (eventName, current) => {
    expect(nextWait(current, event({ eventName, toolName: 'Bash', agentId: 'agent-1' }))).toBe(current)
  })

  it('ends a permission wait when a subagent tool runs', () => {
    expect(nextWait('permission', event({ eventName: 'PostToolUse', agentId: 'a' }))).toBeNull()
  })

  it.each([null, 'permission', 'question'] as const)(
    'keeps %s on a Stop while subagents run',
    (current) => {
      expect(nextWait(current, event({ eventName: 'Stop', subagentsRunning: true }))).toBe(current)
    },
  )

  it('sets permission when a subagent asks', () => {
    const asked = event({ eventName: 'Notification', notificationType: 'permission_prompt', agentId: 'a' })
    expect(nextWait(null, asked)).toBe('permission')
  })
})

describe('afterEscape and clearsWhenSeen', () => {
  it.each([
    ['permission', null],
    ['question', null],
    ['finished', 'finished'],
    [null, null],
  ] as const)('afterEscape(%s) -> %s', (current, expected) => {
    expect(afterEscape(current)).toBe(expected)
  })

  it.each([
    ['finished', true],
    ['permission', false],
    ['question', false],
  ] as const)('clearsWhenSeen(%s) -> %s', (reason, expected) => {
    expect(clearsWhenSeen(reason)).toBe(expected)
  })
})

describe('workingAfter', () => {
  it.each([
    ['UserPromptSubmit', false, true],
    ['PreToolUse', false, true],
    ['PostToolUse', false, true],
    ['Stop', true, false],
    ['Notification', true, false],
    ['SessionEnd', true, false],
    ['SubagentStop', true, true],
    ['SubagentStop', false, false],
  ] as const)('%s with working=%s -> %s', (eventName, current, expected) => {
    expect(workingAfter(eventName, current)).toBe(expected)
  })
})
