import type { WaitReason } from './claudeAttention.js'
import type { AgentDecision, AgentToolCall } from './ports/claudeAgent.js'

export type ChatRequestKind = 'permission' | 'question' | 'plan'

export interface ChatQuestion {
  readonly question: string
  readonly header: string
  readonly multiSelect: boolean
  readonly options: readonly { readonly label: string; readonly description: string }[]
}

export interface ChatRequest {
  readonly id: string
  readonly kind: ChatRequestKind
  readonly toolName: string
  readonly detail: string | null // permission: command / path / short JSON; plan: the plan markdown
  readonly questions: readonly ChatQuestion[] // question only
  readonly canAlwaysAllow: boolean
}

export type ChatAnswer =
  | { readonly kind: 'allow'; readonly always: boolean }
  | { readonly kind: 'deny'; readonly message: string }
  | { readonly kind: 'answers'; readonly answers: Readonly<Record<string, string>> } // question text -> label(s) or own text
  | { readonly kind: 'approvePlan' }
  | { readonly kind: 'revisePlan'; readonly feedback: string }

const MAX_DETAIL_LENGTH = 500
const DETAIL_KEYS = ['command', 'file_path', 'url']

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseQuestion(value: unknown): ChatQuestion | null {
  if (!isRecord(value) || typeof value['question'] !== 'string') {
    return null
  }
  const options: readonly unknown[] = Array.isArray(value['options']) ? value['options'] : []
  return {
    question: value['question'],
    header: typeof value['header'] === 'string' ? value['header'] : '',
    multiSelect: value['multiSelect'] === true,
    options: options.flatMap((option) =>
      isRecord(option) && typeof option['label'] === 'string'
        ? [
            {
              label: option['label'],
              description: typeof option['description'] === 'string' ? option['description'] : '',
            },
          ]
        : [],
    ),
  }
}

function permissionDetail(input: Readonly<Record<string, unknown>>): string | null {
  for (const key of DETAIL_KEYS) {
    const value = input[key]
    if (typeof value === 'string' && value !== '') {
      return value.slice(0, MAX_DETAIL_LENGTH)
    }
  }
  const json = JSON.stringify(input)
  return json === '{}' ? null : json.slice(0, MAX_DETAIL_LENGTH)
}

export function toChatRequest(call: AgentToolCall): ChatRequest {
  const base = { id: call.id, toolName: call.toolName, canAlwaysAllow: call.canAlwaysAllow }
  if (call.toolName === 'AskUserQuestion') {
    const raw: unknown = call.input['questions']
    const items: readonly unknown[] = Array.isArray(raw) ? raw : []
    const questions = items.flatMap((item) => {
      const question = parseQuestion(item)
      return question === null ? [] : [question]
    })
    return { ...base, kind: 'question', detail: null, questions }
  }
  if (call.toolName === 'ExitPlanMode') {
    const plan = call.input['plan']
    return { ...base, kind: 'plan', detail: typeof plan === 'string' ? plan : null, questions: [] }
  }
  return { ...base, kind: 'permission', detail: permissionDetail(call.input), questions: [] }
}

// Null when the answer does not fit the request kind.
export function toDecision(
  request: ChatRequest,
  call: AgentToolCall,
  answer: ChatAnswer,
): AgentDecision | null {
  if (request.kind === 'permission' && answer.kind === 'allow') {
    return { kind: 'allow', always: answer.always && call.canAlwaysAllow }
  }
  if (request.kind !== 'plan' && answer.kind === 'deny') {
    return {
      kind: 'deny',
      message: answer.message === '' ? 'The user denied this.' : answer.message,
    }
  }
  if (request.kind === 'question' && answer.kind === 'answers') {
    return { kind: 'allow', updatedInput: { ...call.input, answers: answer.answers } }
  }
  if (request.kind === 'plan' && answer.kind === 'approvePlan') {
    return { kind: 'allow' }
  }
  if (request.kind === 'plan' && answer.kind === 'revisePlan') {
    return { kind: 'deny', message: answer.feedback === '' ? 'Keep planning.' : answer.feedback }
  }
  return null
}

export function waitOfRequests(requests: readonly ChatRequest[]): WaitReason | null {
  if (requests.some((request) => request.kind !== 'question')) {
    return 'permission'
  }
  return requests.length === 0 ? null : 'question'
}
