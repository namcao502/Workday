import { isTicketKey, pendingFields, type BoardAction } from '@workday/core'
import type { FastifyInstance } from 'fastify'
import type { BoardService } from '../board/boardService.js'
import { isTicketContent, type TicketUpdateService } from '../jira/ticketUpdates.js'
import { isRecord } from '../jsonFile.js'
import type { PrService } from '../prs/prService.js'

const NOT_CONNECTED = { ok: false, error: { code: 'notConnected' } } as const

function isBoardAction(value: string): value is BoardAction {
  return value === 'done' || value === 'reopen' || value === 'dismiss' || value === 'restore'
}

export function registerBoardRoutes(
  app: FastifyInstance,
  board: BoardService,
  prs: PrService,
  ticketUpdates: TicketUpdateService,
): void {
  app.get('/api/board', () => board.view())

  // null when nothing waits: no entry, or everything in it was viewed.
  app.get<{ Params: { key: string } }>('/api/tickets/:key/update', async (request, reply) => {
    const { key } = request.params
    if (!isTicketKey(key)) {
      return reply.code(400).send({ error: 'Invalid ticket key' })
    }
    const entry = ticketUpdates.view()[key]
    if (entry === undefined || pendingFields(entry).length === 0) {
      return { update: null }
    }
    return {
      update: {
        fields: pendingFields(entry),
        viewed: entry.viewed,
        current: entry.current,
        changedBy: entry.changedBy,
        changedAt: entry.changedAt,
      },
    }
  })

  app.post<{ Params: { key: string } }>(
    '/api/tickets/:key/update/viewed',
    async (request, reply) => {
      const { key } = request.params
      const body: unknown = request.body
      const shown = isRecord(body) ? body['shown'] : undefined
      if (!isTicketKey(key) || !isTicketContent(shown)) {
        return reply.code(400).send({ error: 'Body must be { shown: TicketContent }' })
      }
      await ticketUpdates.markViewed(key, shown)
      return { ok: true }
    },
  )

  app.post('/api/board/check', async (_request, reply) => {
    if (!board.isConnected()) {
      return reply.code(409).send(NOT_CONNECTED)
    }
    await board.poll()
    await prs.check()
    return board.view()
  })

  app.post('/api/board/add', async (request, reply) => {
    const body: unknown = request.body
    const input = isRecord(body) ? body['input'] : undefined
    if (typeof input !== 'string') {
      return reply.code(400).send({ error: 'Body must be { input: string }' })
    }
    if (!board.isConnected()) {
      return reply.code(409).send(NOT_CONNECTED)
    }
    return board.add(input)
  })

  app.post<{ Params: { key: string; action: string } }>(
    '/api/board/:key/:action',
    async (request, reply) => {
      const { key, action } = request.params
      if (!isBoardAction(action)) {
        return reply.code(404).send({ error: 'Not found' })
      }
      await board.act(key, action)
      return board.view()
    },
  )
}
