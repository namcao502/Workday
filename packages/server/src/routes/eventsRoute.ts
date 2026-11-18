import type { FastifyInstance } from 'fastify'
import type { EventHub, RemoteSurface } from '../events.js'
import { isAllowedOrigin } from '../security/allowedHosts.js'

export function registerEventsRoute(
  app: FastifyInstance,
  events: EventHub,
  allowedHosts: ReadonlySet<string>,
  surface: RemoteSurface,
): void {
  app.get(
    '/api/events',
    {
      websocket: true,
      config: { access: { area: 'any' } },
      // A browser always sends Origin; a page on another site must not read our events.
      preValidation: async (request, reply) => {
        const { origin } = request.headers
        const isAllowed =
          origin === undefined ||
          (request.isRemote
            ? request.remoteOrigin !== null && origin === request.remoteOrigin
            : isAllowedOrigin(origin, allowedHosts))
        if (!isAllowed) {
          return reply.code(403).send({ error: 'Forbidden origin' })
        }
        return undefined
      },
    },
    (socket, request) => {
      const remove = events.add(socket, request.remoteDevice?.id ?? null, surface)
      socket.on('close', remove)
    },
  )
}
