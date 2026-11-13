import type { AgentMode, ChatAnswer } from '@workday/core'
import type { FastifyInstance } from 'fastify'
import { isRecord } from '../jsonFile.js'
import type { WorkspaceService } from '../workspace/workspaceService.js'

export const MAX_PROMPT_LENGTH = 100_000
const AGENT_MODES: ReadonlySet<string> = new Set([
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
])

const SESSION_NOT_FOUND = { ok: false, error: { code: 'sessionNotFound' } } as const
const OK = { ok: true } as const

// NFC and \n line breaks; null when empty or too long.
function promptText(body: unknown): string | null {
  const raw = isRecord(body) ? body['text'] : undefined
  if (typeof raw !== 'string') {
    return null
  }
  const text = raw.normalize('NFC').replaceAll('\r\n', '\n')
  return text.trim() === '' || text.length > MAX_PROMPT_LENGTH ? null : text
}

function isAgentMode(value: unknown): value is AgentMode {
  return typeof value === 'string' && AGENT_MODES.has(value)
}

function agentMode(body: unknown): AgentMode | null {
  const mode = isRecord(body) ? body['mode'] : undefined
  return isAgentMode(mode) ? mode : null
}

function stringRecord(value: unknown): Readonly<Record<string, string>> | null {
  if (!isRecord(value)) {
    return null
  }
  const entries = Object.entries(value)
  return entries.every((entry): entry is [string, string] => typeof entry[1] === 'string')
    ? Object.fromEntries(entries)
    : null
}

// Null unless the body is exactly one ChatAnswer shape with the right field types.
export function parseChatAnswer(body: unknown): ChatAnswer | null {
  if (!isRecord(body)) {
    return null
  }
  switch (body['kind']) {
    case 'allow':
      return typeof body['always'] === 'boolean' ? { kind: 'allow', always: body['always'] } : null
    case 'deny':
      return typeof body['message'] === 'string' ? { kind: 'deny', message: body['message'] } : null
    case 'answers': {
      const answers = stringRecord(body['answers'])
      return answers === null ? null : { kind: 'answers', answers }
    }
    case 'approvePlan':
      return { kind: 'approvePlan' }
    case 'revisePlan':
      return typeof body['feedback'] === 'string'
        ? { kind: 'revisePlan', feedback: body['feedback'] }
        : null
    default:
      return null
  }
}

// Local-only like the other workspace routes: none declares config.access.
export function registerChatRoutes(app: FastifyInstance, workspace: WorkspaceService): void {
  app.get<{ Params: { name: string } }>('/api/workspace/sessions/:name/chat', (request, reply) => {
    const chat = workspace.chat(request.params.name)
    return chat === null ? reply.code(404).send(SESSION_NOT_FOUND) : chat
  })

  app.post<{ Params: { name: string } }>(
    '/api/workspace/sessions/:name/prompt',
    (request, reply) => {
      const { name } = request.params
      if (!workspace.hasSession(name)) {
        return reply.code(404).send(SESSION_NOT_FOUND)
      }
      const text = promptText(request.body)
      if (text === null) {
        return reply.code(400).send({ error: 'Body must be { text: 1..100000 characters }' })
      }
      const outcome = workspace.send(name, text)
      if (outcome === 'sent') {
        return OK
      }
      if (outcome === 'notFound') {
        return reply.code(404).send(SESSION_NOT_FOUND)
      }
      const code = outcome === 'waiting' ? 'claudeWaiting' : outcome
      return reply.code(409).send({ ok: false, error: { code } })
    },
  )

  app.post<{ Params: { name: string } }>(
    '/api/workspace/sessions/:name/interrupt',
    async (request, reply) => {
      const found = await workspace.interrupt(request.params.name)
      return found ? OK : reply.code(404).send(SESSION_NOT_FOUND)
    },
  )

  app.post<{ Params: { name: string } }>(
    '/api/workspace/sessions/:name/mode',
    async (request, reply) => {
      const { name } = request.params
      if (!workspace.hasSession(name)) {
        return reply.code(404).send(SESSION_NOT_FOUND)
      }
      const mode = agentMode(request.body)
      if (mode === null) {
        return reply.code(400).send({ error: 'Body must be { mode: AgentMode }' })
      }
      const found = await workspace.setMode(name, mode)
      return found ? OK : reply.code(404).send(SESSION_NOT_FOUND)
    },
  )

  app.post<{ Params: { name: string; id: string } }>(
    '/api/workspace/sessions/:name/requests/:id',
    (request, reply) => {
      const { name, id } = request.params
      if (!workspace.hasSession(name)) {
        return reply.code(404).send(SESSION_NOT_FOUND)
      }
      const answer = parseChatAnswer(request.body)
      if (answer === null) {
        return reply.code(400).send({ error: 'Body must be a ChatAnswer' })
      }
      const outcome = workspace.answer(name, id, answer)
      if (outcome === 'ok') {
        return OK
      }
      return outcome === 'notFound'
        ? reply.code(404).send({ error: 'No open request with that id' })
        : reply.code(400).send({ error: 'The answer does not fit the request' })
    },
  )
}
