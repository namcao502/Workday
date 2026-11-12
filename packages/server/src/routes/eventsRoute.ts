import type { FastifyInstance } from 'fastify'
import type { EventHub } from '../events.js'
import type { RemoteService } from '../remote/remoteService.js'
import { isAllowedOrigin, remoteOrigin } from '../security/allowedHosts.js'

export function registerEventsRoute(
  app: FastifyInstance,
  events: EventHub,
  allowedHosts: ReadonlySet<string>,
  remote: RemoteService,
): void {
  app.get(
    '/api/events',
    {
      websocket: true,
      config: { access: { area: 'any' } },
      // A browser always sends Origin; a page on another site must not read our events.
      preValidation: async (request, reply) => {
        const { origin } = request.headers
        const publicHost = remote.config?.publicHost ?? null
        const isAllowed =
          origin === undefined ||
          (request.isRemote
            ? publicHost !== null && origin === remoteOrigin(publicHost)
            : isAllowedOrigin(origin, allowedHosts))
        if (!isAllowed) {
          return reply.code(403).send({ error: 'Forbidden origin' })
        }
        return undefined
      },
    },
    (socket, request) => {
      const remove = events.add(socket, request.remoteDevice?.id ?? null)
      socket.on('close', remove)
    },
  )
}
