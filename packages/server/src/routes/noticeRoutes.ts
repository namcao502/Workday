import type { FastifyInstance } from 'fastify'
import { isRecord } from '../jsonFile.js'
import type { NoticeService } from '../notices/noticeService.js'

const BOARD_VIEW = { config: { access: { area: 'board', level: 'view' } } } as const
const POSITIVE_INTEGER = /^[1-9]\d*$/

export function registerNoticeRoutes(app: FastifyInstance, notices: NoticeService): void {
  app.get('/api/notices', BOARD_VIEW, () => notices.view())

  app.post<{ Params: { id: string } }>('/api/notices/:id/read', BOARD_VIEW, async (request, reply) => {
    const { id } = request.params
    if (!POSITIVE_INTEGER.test(id) || !Number.isSafeInteger(Number(id))) {
      return reply.code(400).send({ error: 'The id must be a positive integer' })
    }
    await notices.markRead(Number(id))
    return notices.view()
  })

  app.post('/api/notices/read-all', BOARD_VIEW, async () => {
    await notices.markAllRead()
    return notices.view()
  })

  app.post('/api/notices/read-place', BOARD_VIEW, async (request, reply) => {
    const body: unknown = request.body
    const place = isRecord(body) ? body['place'] : undefined
    if (typeof place !== 'string' || place === '') {
      return reply.code(400).send({ error: 'Body must be { place: string }' })
    }
    await notices.markReadAt(place)
    return notices.view()
  })
}
