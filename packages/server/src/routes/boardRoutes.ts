import type { BoardAction } from '@workday/core'
import type { FastifyInstance } from 'fastify'
import type { BoardService } from '../board/boardService.js'
import { isRecord } from '../jsonFile.js'

const NOT_CONNECTED = { ok: false, error: { code: 'notConnected' } } as const

function isBoardAction(value: string): value is BoardAction {
  return value === 'done' || value === 'reopen' || value === 'dismiss' || value === 'restore'
}

export function registerBoardRoutes(app: FastifyInstance, board: BoardService): void {
  app.get('/api/board', () => board.view())

  app.post('/api/board/check', async (_request, reply) => {
    if (!board.isConnected()) {
      return reply.code(409).send(NOT_CONNECTED)
    }
    await board.poll()
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
