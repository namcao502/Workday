import type { FastifyInstance } from 'fastify'
import type { ClientKind, EventHub, RemoteSurface } from '../events.js'
import { isRecord } from '../jsonFile.js'
import { isAllowedOrigin } from '../security/allowedHosts.js'

function clientOf(query: unknown): ClientKind | null {
  const client = isRecord(query) ? query['client'] : undefined
  return client === 'app' || client === 'web' ? client : null
}

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
      const deviceId = request.remoteDevice?.id ?? null
      const remove = events.add(socket, deviceId, surface, clientOf(request.query))
      socket.on('close', remove)
    },
  )
}
