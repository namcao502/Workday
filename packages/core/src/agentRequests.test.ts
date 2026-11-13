import { describe, expect, it } from 'vitest'
import type { AgentToolCall } from './ports/claudeAgent.js'
import { toChatRequest, toDecision, waitOfRequests, type ChatRequest } from './agentRequests.js'

function call(
  toolName: string,
  input: Record<string, unknown>,
  canAlwaysAllow = true,
): AgentToolCall {
  return { id: 'c1', toolName, input, canAlwaysAllow }
}

describe('agentRequests', () => {
  it('toChatRequest maps AskUserQuestion, ExitPlanMode and a Bash call', () => {
    const questions = [
      {
        question: 'Which?',
        header: 'Pick',
        multiSelect: false,
        options: [{ label: 'A', description: 'first' }],
      },
    ]
    const ask = toChatRequest(call('AskUserQuestion', { questions }))
    expect(ask.kind).toBe('question')
    expect(ask.questions).toEqual(questions)
    const plan = toChatRequest(call('ExitPlanMode', { plan: '# Plan' }))
    expect(plan).toMatchObject({ kind: 'plan', detail: '# Plan' })
    const bash = toChatRequest(call('Bash', { command: 'ls -la' }))
    expect(bash).toMatchObject({ kind: 'permission', toolName: 'Bash', detail: 'ls -la' })
    expect(toChatRequest(call('Edit', { file_path: 'a.ts' })).detail).toBe('a.ts')
    expect(toChatRequest(call('WebFetch', { url: 'http://x' })).detail).toBe('http://x')
    expect(toChatRequest(call('Other', { x: 'y'.repeat(600) })).detail).toHaveLength(500)
  })

  it('toChatRequest tolerates a malformed questions input', () => {
    expect(toChatRequest(call('AskUserQuestion', { questions: 'nope' })).questions).toEqual([])
    expect(toChatRequest(call('AskUserQuestion', {})).questions).toEqual([])
    const mixed = toChatRequest(call('AskUserQuestion', { questions: [5, { question: 1 }] }))
    expect(mixed.questions).toEqual([])
  })

  it('toDecision answers a question with updatedInput.answers', () => {
    const c = call('AskUserQuestion', { questions: [] })
    const decision = toDecision(toChatRequest(c), c, {
      kind: 'answers',
      answers: { 'Which?': 'A' },
    })
    expect(decision).toEqual({
      kind: 'allow',
      updatedInput: { questions: [], answers: { 'Which?': 'A' } },
    })
  })

  it('toDecision turns plan feedback into a deny message and approve into allow', () => {
    const c = call('ExitPlanMode', { plan: 'p' })
    const request = toChatRequest(c)
    expect(toDecision(request, c, { kind: 'approvePlan' })).toEqual({ kind: 'allow' })
    expect(toDecision(request, c, { kind: 'revisePlan', feedback: 'add tests' })).toEqual({
      kind: 'deny',
      message: 'add tests',
    })
    expect(toDecision(request, c, { kind: 'revisePlan', feedback: '' })).toEqual({
      kind: 'deny',
      message: 'Keep planning.',
    })
  })

  it('toDecision ignores always when the call cannot be always-allowed', () => {
    const can = call('Bash', { command: 'ls' }, true)
    const cannot = call('Bash', { command: 'ls' }, false)
    expect(toDecision(toChatRequest(can), can, { kind: 'allow', always: true })).toEqual({
      kind: 'allow',
      always: true,
    })
    expect(toDecision(toChatRequest(cannot), cannot, { kind: 'allow', always: true })).toEqual({
      kind: 'allow',
      always: false,
    })
    expect(toDecision(toChatRequest(can), can, { kind: 'deny', message: '' })).toEqual({
      kind: 'deny',
      message: 'The user denied this.',
    })
  })

  it('toDecision returns null for an answer of the wrong kind', () => {
    const c = call('Bash', { command: 'ls' })
    expect(toDecision(toChatRequest(c), c, { kind: 'approvePlan' })).toBeNull()
    expect(toDecision(toChatRequest(c), c, { kind: 'answers', answers: {} })).toBeNull()
    const q = call('AskUserQuestion', {})
    expect(toDecision(toChatRequest(q), q, { kind: 'allow', always: false })).toBeNull()
  })

  it('waitOfRequests prefers permission over question', () => {
    const make = (kind: ChatRequest['kind']): ChatRequest => ({
      id: kind,
      kind,
      toolName: 't',
      detail: null,
      questions: [],
      canAlwaysAllow: false,
    })
    expect(waitOfRequests([])).toBeNull()
    expect(waitOfRequests([make('question')])).toBe('question')
    expect(waitOfRequests([make('question'), make('permission')])).toBe('permission')
    expect(waitOfRequests([make('plan')])).toBe('permission')
  })
})
