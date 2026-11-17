import type { FastifyInstance } from 'fastify'
import { isRecord } from '../jsonFile.js'
import type { Notice } from '@workday/core'
import type { NoticeService } from '../notices/noticeService.js'
import type { TeamsWatcher } from '../teams/teamsWatcher.js'

const BOARD_VIEW = { config: { access: { area: 'board', level: 'view' } } } as const
const POSITIVE_INTEGER = /^[1-9]\d*$/

// Reading a Teams notice also reads its conversation, so the ticket's to-do and its dot go with it.
async function markTeamsSeen(
  notices: NoticeService,
  teams: TeamsWatcher,
  isRead: (notice: Notice) => boolean,
): Promise<void> {
  for (const notice of notices.view().notices) {
    const { target } = notice
    if (!notice.read && isRead(notice) && target !== null && target.kind === 'teams') {
      await teams.seen(target.key, target.conversationId).catch(() => undefined)
    }
  }
}

export function registerNoticeRoutes(
  app: FastifyInstance,
  notices: NoticeService,
  teams: TeamsWatcher,
): void {
  app.get('/api/notices', BOARD_VIEW, () => notices.view())

  app.post<{ Params: { id: string } }>(
    '/api/notices/:id/read',
    BOARD_VIEW,
    async (request, reply) => {
      const { id } = request.params
      if (!POSITIVE_INTEGER.test(id) || !Number.isSafeInteger(Number(id))) {
        return reply.code(400).send({ error: 'The id must be a positive integer' })
      }
      await markTeamsSeen(notices, teams, (notice) => notice.id === Number(id))
      await notices.markRead(Number(id))
      return notices.view()
    },
  )

  app.post('/api/notices/read-all', BOARD_VIEW, async () => {
    await markTeamsSeen(notices, teams, () => true)
    await notices.markAllRead()
    return notices.view()
  })

  app.post('/api/notices/read-place', BOARD_VIEW, async (request, reply) => {
    const body: unknown = request.body
    const place = isRecord(body) ? body['place'] : undefined
    if (typeof place !== 'string' || place === '') {
      return reply.code(400).send({ error: 'Body must be { place: string }' })
    }
    await markTeamsSeen(notices, teams, (notice) => notice.place === place)
    await notices.markReadAt(place)
    return notices.view()
  })
}
