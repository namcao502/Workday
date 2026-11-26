import type { AgentImage, AgentImageType, AgentMode, ChatAnswer } from '@workday/core'
import type { FastifyInstance } from 'fastify'
import { isRecord } from '../jsonFile.js'
import { readGitStatusCached } from '../workspace/gitStatus.js'
import type { WorkspaceService } from '../workspace/workspaceService.js'

export const MAX_PROMPT_LENGTH = 100_000
const MAX_MODEL_LENGTH = 100
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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
  return text.length > MAX_PROMPT_LENGTH ? null : text
}

const IMAGE_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])
const MAX_IMAGES = 5
const MAX_IMAGE_BASE64_LENGTH = 7_000_000 // about 5 MB of image
export const PROMPT_BODY_LIMIT = MAX_IMAGES * MAX_IMAGE_BASE64_LENGTH + MAX_PROMPT_LENGTH + 10_000

function isImageType(value: unknown): value is AgentImageType {
  return typeof value === 'string' && IMAGE_TYPES.has(value)
}

// Null when the field is present but malformed; no field is an empty list.
export function parseImages(body: unknown): readonly AgentImage[] | null {
  const raw = isRecord(body) ? body['images'] : undefined
  if (raw === undefined) {
    return []
  }
  if (!Array.isArray(raw) || raw.length > MAX_IMAGES) {
    return null
  }
  const images: AgentImage[] = []
  for (const item of raw as unknown[]) {
    const mediaType = isRecord(item) ? item['mediaType'] : undefined
    const data = isRecord(item) ? item['data'] : undefined
    if (
      !isImageType(mediaType) ||
      typeof data !== 'string' ||
      data === '' ||
      data.length > MAX_IMAGE_BASE64_LENGTH ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
    ) {
      return null
    }
    images.push({ mediaType, data })
  }
  return images
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
  app.get<{ Params: { name: string } }>(
    '/api/workspace/sessions/:name/chat',
    async (request, reply) => {
      const chat = workspace.chat(request.params.name)
      if (chat === null) {
        return reply.code(404).send(SESSION_NOT_FOUND)
      }
      const cwd = workspace.sessionDirectory(request.params.name)
      return cwd === null ? chat : { ...chat, ...(await readGitStatusCached(cwd)) }
    },
  )

  app.post<{ Params: { name: string } }>(
    '/api/workspace/sessions/:name/prompt',
    { bodyLimit: PROMPT_BODY_LIMIT },
    (request, reply) => {
      const { name } = request.params
      if (!workspace.hasSession(name)) {
        return reply.code(404).send(SESSION_NOT_FOUND)
      }
      const text = promptText(request.body)
      const images = parseImages(request.body)
      if (text === null || images === null || (text.trim() === '' && images.length === 0)) {
        return reply.code(400).send({
          error: 'Body must be { text: up to 100000 characters, images?: up to 5 base64 images }',
        })
      }
      const outcome = workspace.send(name, text, images)
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

  app.post<{ Params: { name: string } }>(
    '/api/workspace/sessions/:name/rewind',
    async (request, reply) => {
      const body = request.body
      const messageId = isRecord(body) ? body['messageId'] : undefined
      const dryRun = isRecord(body) ? body['dryRun'] : undefined
      if (typeof messageId !== 'string' || !UUID.test(messageId) || typeof dryRun !== 'boolean') {
        return reply.code(400).send({ error: 'Body must be { messageId: uuid, dryRun: boolean }' })
      }
      const result = await workspace.rewind(request.params.name, messageId, dryRun)
      return result === null ? reply.code(404).send(SESSION_NOT_FOUND) : result
    },
  )

  app.get<{ Params: { name: string } }>(
    '/api/workspace/sessions/:name/past-chats',
    (request, reply) => {
      const chats = workspace.pastChats(request.params.name)
      return chats === null ? reply.code(404).send(SESSION_NOT_FOUND) : chats
    },
  )

  app.post<{ Params: { name: string } }>(
    '/api/workspace/sessions/:name/resume',
    async (request, reply) => {
      const sessionId = isRecord(request.body) ? request.body['sessionId'] : undefined
      if (typeof sessionId !== 'string' || !UUID.test(sessionId)) {
        return reply.code(400).send({ error: 'Body must be { sessionId: uuid }' })
      }
      const outcome = await workspace.resumeChat(request.params.name, sessionId)
      switch (outcome) {
        case 'ok':
          return OK
        case 'notFound':
          return reply.code(404).send(SESSION_NOT_FOUND)
        case 'chatNotFound':
          return reply.code(404).send({ ok: false, error: { code: 'chatNotFound' } })
        case 'claudeWorking':
          return reply.code(409).send({ ok: false, error: { code: 'claudeWorking' } })
      }
    },
  )

  app.post<{ Params: { name: string } }>(
    '/api/workspace/sessions/:name/model',
    async (request, reply) => {
      const model = isRecord(request.body) ? request.body['model'] : undefined
      if (typeof model !== 'string' || model.trim() === '' || model.length > MAX_MODEL_LENGTH) {
        return reply.code(400).send({ error: 'Body must be { model: string }' })
      }
      const found = await workspace.setModel(request.params.name, model.trim())
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
