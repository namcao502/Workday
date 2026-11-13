import type { FastifyInstance } from 'fastify'
import { isRecord } from '../jsonFile.js'
import type { WorkspaceService } from '../workspace/workspaceService.js'

export const MAX_PROMPT_LENGTH = 100_000
export const SUBMIT_DELAY_MS = 150
const KEYS = { escape: '\x1b', shiftTab: '\x1b[Z' } as const

type KeyName = keyof typeof KEYS

const SESSION_NOT_FOUND = { ok: false, error: { code: 'sessionNotFound' } } as const

// NFC and \n line breaks; null when empty or too long.
function promptText(body: unknown): string | null {
  const raw = isRecord(body) ? body['text'] : undefined
  if (typeof raw !== 'string') {
    return null
  }
  const text = raw.normalize('NFC').replaceAll('\r\n', '\n')
  return text.trim() === '' || text.length > MAX_PROMPT_LENGTH ? null : text
}

function keyName(body: unknown): KeyName | null {
  const key = isRecord(body) ? body['key'] : undefined
  return key === 'escape' || key === 'shiftTab' ? key : null
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
      const host = workspace.host(request.params.name)
      if (host === null) {
        return reply.code(404).send(SESSION_NOT_FOUND)
      }
      const text = promptText(request.body)
      if (text === null) {
        return reply.code(400).send({ error: 'Body must be { text: 1..100000 characters }' })
      }
      // Claude's input takes the Enter as a submit only when it arrives after the text, not inside it.
      host.write(text)
      setTimeout(() => {
        host.write('\r')
      }, SUBMIT_DELAY_MS)
      return { ok: true }
    },
  )

  app.post<{ Params: { name: string } }>('/api/workspace/sessions/:name/key', (request, reply) => {
    const host = workspace.host(request.params.name)
    if (host === null) {
      return reply.code(404).send(SESSION_NOT_FOUND)
    }
    const key = keyName(request.body)
    if (key === null) {
      return reply.code(400).send({ error: "Body must be { key: 'escape' | 'shiftTab' }" })
    }
    host.write(KEYS[key])
    if (key === 'escape') {
      workspace.escape(request.params.name)
    }
    return { ok: true }
  })
}
