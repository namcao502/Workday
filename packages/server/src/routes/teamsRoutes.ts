import { isTicketKey, type TeamsDraft, type TeamsMention } from '@workday/core'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { isRecord } from '../jsonFile.js'
import type { TeamsService } from '../teams/teamsService.js'
import type { TeamsWatcher } from '../teams/teamsWatcher.js'
import { teamsError, type WriteOutcome } from '../teams/teamsWrites.js'

const MAX_TEXT_LENGTH = 200_000
const MAX_MENTIONS = 50
const IMAGE_CACHE = 'private, max-age=86400'
const IMAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox"

type Body = Readonly<Record<string, unknown>>
type KeyRequest = { Params: { key: string }; Body: unknown }

function text(body: Body, name: string): string | null {
  const value = body[name]
  return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH ? value : null
}

function nullableText(body: Body, name: string): string | null | undefined {
  return body[name] === null ? null : (text(body, name) ?? undefined)
}

function mention(raw: unknown): TeamsMention | null {
  if (!isRecord(raw)) {
    return null
  }
  const { text: label, mri, displayName } = raw
  return typeof label === 'string' && typeof mri === 'string' && typeof displayName === 'string'
    ? { text: label, mri, displayName }
    : null
}

// Shape only: buildBody is the whitelist the HTML goes through before anything is sent.
function draftOf(body: Body): TeamsDraft | null {
  const raw = body['draft']
  if (!isRecord(raw) || typeof raw['html'] !== 'string' || raw['html'].length > MAX_TEXT_LENGTH) {
    return null
  }
  const list = raw['mentions']
  if (!Array.isArray(list) || list.length > MAX_MENTIONS) {
    return null
  }
  const mentions = list.map(mention)
  return mentions.every((item) => item !== null) ? { html: raw['html'], mentions } : null
}

function bad(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(400).send({ error: message })
}

function answer(reply: FastifyReply, outcome: WriteOutcome): FastifyReply | WriteOutcome {
  return outcome === 'invalid' ? bad(reply, 'The Teams request is not valid') : outcome
}

// Local-only: no route declares config.access, so the remote gate refuses them.
export function registerTeamsRoutes(
  app: FastifyInstance,
  teams: TeamsService,
  watcher: TeamsWatcher,
): void {
  app.get('/api/teams/status', () => teams.status())

  app.post('/api/teams/signin', () => teams.signIn())

  app.get<{ Querystring: { url?: string } }>('/api/teams/image', async (request, reply) => {
    const url = request.query.url ?? ''
    try {
      const image = await teams.image(url)
      if (image === null) {
        return await bad(reply, 'Only Teams message images are served')
      }
      return await reply
        .header('content-type', image.contentType)
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', IMAGE_CSP)
        .header('cache-control', IMAGE_CACHE)
        .send(Buffer.from(image.bytes))
    } catch (error: unknown) {
      return reply.code(502).send({ ok: false, error: teamsError(error) })
    }
  })

  app.get<{ Params: { key: string }; Querystring: { conversation?: string } }>(
    '/api/teams/:key',
    async (request, reply) => {
      const { key } = request.params
      if (!isTicketKey(key)) {
        return reply.code(400).send({ ok: false, error: { code: 'invalidKey' } })
      }
      try {
        const view = await teams.read(key, request.query.conversation ?? '')
        return { ...view, pending: watcher.pendingIds(key) }
      } catch (error: unknown) {
        return reply.code(502).send({ ok: false, error: teamsError(error) })
      }
    },
  )

  // Parses the body, then runs the write; a wrong key or shape is a 400.
  function writeRoute(
    path: string,
    run: (key: string, body: Body) => Promise<WriteOutcome> | null,
  ): void {
    app.post<KeyRequest>(`/api/teams/:key/${path}`, async (request, reply) => {
      const { key } = request.params
      if (!isTicketKey(key)) {
        return reply.code(400).send({ ok: false, error: { code: 'invalidKey' } })
      }
      const pending = isRecord(request.body) ? run(key, request.body) : null
      return pending === null ? bad(reply, 'The body is not valid') : answer(reply, await pending)
    })
  }

  writeRoute('post', (key, body) => {
    const [channelId, subject, draft] = [
      text(body, 'channelId'),
      text(body, 'subject'),
      draftOf(body),
    ]
    return channelId === null || subject === null || draft === null
      ? null
      : teams.write.post(key, { channelId, subject, draft, confirm: body['confirm'] === true })
  })

  writeRoute('reply', (key, body) => {
    const [conversationId, rootId, draft] = [
      text(body, 'conversationId'),
      nullableText(body, 'rootId'),
      draftOf(body),
    ]
    return conversationId === null || rootId === undefined || draft === null
      ? null
      : teams.write.reply(key, { conversationId, rootId, draft, confirm: body['confirm'] === true })
  })

  writeRoute('edit', (key, body) => {
    const conversationId = text(body, 'conversationId')
    const messageId = text(body, 'messageId')
    const subject = nullableText(body, 'subject')
    const draft = draftOf(body)
    return conversationId === null || messageId === null || subject === undefined || draft === null
      ? null
      : teams.write.edit(key, { conversationId, messageId, subject, draft })
  })

  writeRoute('delete', (key, body) => {
    const [conversationId, messageId] = [text(body, 'conversationId'), text(body, 'messageId')]
    return conversationId === null || messageId === null
      ? null
      : teams.write.remove(key, { conversationId, messageId })
  })

  writeRoute('react', (key, body) => {
    const conversationId = text(body, 'conversationId')
    const messageId = text(body, 'messageId')
    const reaction = text(body, 'key')
    return conversationId === null || messageId === null || reaction === null
      ? null
      : teams.write.react(key, { conversationId, messageId, key: reaction })
  })

  app.post<KeyRequest>('/api/teams/:key/seen', async (request, reply) => {
    const { key } = request.params
    const body = isRecord(request.body) ? request.body : {}
    const conversationId = text(body, 'conversationId')
    if (!isTicketKey(key) || conversationId === null) {
      return bad(reply, 'The body is not valid')
    }
    await watcher.seen(key, conversationId)
    return { ok: true }
  })

  app.post<KeyRequest>('/api/teams/:key/handoff', async (request, reply) => {
    const { key } = request.params
    if (!isTicketKey(key)) {
      return reply.code(400).send({ ok: false, error: { code: 'invalidKey' } })
    }
    const body = isRecord(request.body) ? request.body : {}
    const conversationId = text(body, 'conversationId')
    const messageId = text(body, 'messageId')
    const session = text(body, 'session')
    if (conversationId === null || messageId === null || session === null) {
      return bad(reply, 'The body is not valid')
    }
    return teams.handOff(key, { conversationId, messageId, session })
  })
}
