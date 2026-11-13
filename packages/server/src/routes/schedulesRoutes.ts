import type { FastifyInstance } from 'fastify'
import type { ScanRunner } from '../schedules/scanRunner.js'
import { schedulesView, type SchedulesSource } from '../schedules/schedulesView.js'

// Local-only: no config.access, so a remote request never reaches it.
export function registerSchedulesRoutes(app: FastifyInstance, source: SchedulesSource): void {
  const runner: ScanRunner = source.runner

  app.get('/api/schedules', () => schedulesView(source))

  app.post('/api/schedules/scan/run', async (_request, reply) => {
    const result = runner.runNow()
    if (result === 'notConfigured') {
      return reply.code(400).send({ error: 'No scan command is set up' })
    }
    return result.ok ? result : reply.code(409).send(result)
  })

  app.post('/api/schedules/scan/seen', () => {
    runner.markSeen()
    return { ok: true }
  })

  app.get<{ Params: { id: string }; Querystring: { from?: string } }>(
    '/api/schedules/scan/runs/:id/log',
    async (request, reply) => {
      const from = Number(request.query.from ?? '0')
      if (!Number.isSafeInteger(from) || from < 0) {
        return reply.code(400).send({ error: 'from must be a byte offset' })
      }
      const chunk = await runner.readLog(request.params.id, from)
      return chunk ?? reply.code(404).send({ error: 'Unknown run' })
    },
  )
}
