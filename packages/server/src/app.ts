import { existsSync } from 'node:fs'
import { join } from 'node:path'
import fastifyStatic from '@fastify/static'
import fastifyWebsocket from '@fastify/websocket'
import Fastify, { type FastifyInstance } from 'fastify'
import type { BoardService } from './board/boardService.js'
import type { EventHub } from './events.js'
import { registerBoardRoutes } from './routes/boardRoutes.js'
import { registerEventsRoute } from './routes/eventsRoute.js'
import { registerSettingsRoutes } from './routes/settingsRoutes.js'
import { allowedHostHeaders, isAllowedHost } from './security/allowedHosts.js'
import type { SettingsService } from './settings/settingsService.js'

export interface AppDeps {
  port: number
  dev: boolean
  version: string
  // Built client folder; the SPA fallback is active only when it exists.
  clientDist?: string | undefined
  board: BoardService
  settings: SettingsService
  events: EventHub
}

export async function createApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify()
  const allowedHosts = allowedHostHeaders({ port: deps.port, dev: deps.dev })

  // Blocks DNS rebinding: a page on another domain pointed at 127.0.0.1 sends its own Host.
  app.addHook('onRequest', async (request, reply) => {
    if (!isAllowedHost(request.headers.host, allowedHosts)) {
      return reply.code(403).send({ error: 'Forbidden host' })
    }
    return undefined
  })

  await app.register(fastifyWebsocket)

  app.get('/api/health', () => ({ ok: true, version: deps.version }))

  registerEventsRoute(app, deps.events, allowedHosts)
  registerBoardRoutes(app, deps.board)
  registerSettingsRoutes(app, deps.settings)

  const { clientDist } = deps
  const hasClient = clientDist !== undefined && existsSync(join(clientDist, 'index.html'))
  if (hasClient) {
    await app.register(fastifyStatic, { root: clientDist })
  }

  app.setNotFoundHandler(async (request, reply) => {
    const isApiRoute = request.url === '/api' || request.url.startsWith('/api/')
    if (hasClient && !isApiRoute && request.method === 'GET') {
      return reply.sendFile('index.html')
    }
    return reply.code(404).send({ error: 'Not found' })
  })

  return app
}
