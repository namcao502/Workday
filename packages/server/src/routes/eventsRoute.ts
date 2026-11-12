import type { FastifyInstance } from 'fastify'
import type { EventHub } from '../events.js'
import { isAllowedOrigin } from '../security/allowedHosts.js'

export function registerEventsRoute(
  app: FastifyInstance,
  events: EventHub,
  allowedHosts: ReadonlySet<string>,
): void {
  app.get(
    '/api/events',
    {
      websocket: true,
      // A browser always sends Origin; a page on another site must not read our events.
      preValidation: async (request, reply) => {
        const { origin } = request.headers
        if (origin !== undefined && !isAllowedOrigin(origin, allowedHosts)) {
          return reply.code(403).send({ error: 'Forbidden origin' })
        }
        return undefined
      },
    },
    (socket) => {
      const remove = events.add(socket)
      socket.on('close', remove)
    },
  )
}
