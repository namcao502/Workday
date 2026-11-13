import { existsSync } from 'node:fs'
import { join } from 'node:path'
import fastifyStatic from '@fastify/static'
import fastifyWebsocket from '@fastify/websocket'
import Fastify, { type FastifyInstance } from 'fastify'
import type { BoardService } from './board/boardService.js'
import type { PrService } from './prs/prService.js'
import type { EventHub } from './events.js'
import type { NoticeService } from './notices/noticeService.js'
import { registerBoardRoutes } from './routes/boardRoutes.js'
import { registerNoticeRoutes } from './routes/noticeRoutes.js'
import { registerRemoteGate } from './remote/remoteGate.js'
import type { RemoteService } from './remote/remoteService.js'
import { registerEventsRoute } from './routes/eventsRoute.js'
import { registerHookRoute } from './routes/hookRoute.js'
import { registerPushRoutes } from './routes/pushRoutes.js'
import { registerRemoteRoutes } from './routes/remoteRoutes.js'
import { registerSettingsRoutes } from './routes/settingsRoutes.js'
import { registerTeamsRoutes } from './routes/teamsRoutes.js'
import { registerTerminalRoute } from './routes/terminalRoute.js'
import { registerTimesheetRoutes } from './routes/timesheetRoutes.js'
import { registerChatRoutes } from './routes/chatRoute.js'
import { registerWorkRoutes } from './routes/workRoutes.js'
import { registerWorkspaceFilesRoutes } from './routes/workspaceFilesRoutes.js'
import { registerWorkspaceRoutes } from './routes/workspaceRoutes.js'
import { allowedHostHeaders, isAllowedHost, remoteHostHeaders } from './security/allowedHosts.js'
import type { SettingsService } from './settings/settingsService.js'
import type { SuggestionService } from './suggestions/suggestionService.js'
import type { TeamsService } from './teams/teamsService.js'
import type { TeamsWatcher } from './teams/teamsWatcher.js'
import type { TimesheetService } from './timesheet/timesheetService.js'
import type { WorkspaceService } from './workspace/workspaceService.js'

const TERMINAL_MAX_PAYLOAD = 1024 * 1024

export interface AppDeps {
  port: number
  dev: boolean
  version: string
  // Built client folder; the SPA fallback is active only when it exists.
  clientDist?: string | undefined
  board: BoardService
  prs: PrService
  suggestions: SuggestionService
  settings: SettingsService
  timesheet: TimesheetService
  events: EventHub
  remote: RemoteService
  notices: NoticeService
  workspace: WorkspaceService
  teams: TeamsService
  teamsWatcher: TeamsWatcher
}

export async function createApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify()
  const allowedHosts = allowedHostHeaders({ port: deps.port, dev: deps.dev })

  // Blocks DNS rebinding: a page on another domain pointed at 127.0.0.1 sends its own Host.
  app.addHook('onRequest', async (request, reply) => {
    const { host } = request.headers
    const publicHosts = remoteHostHeaders(deps.remote.config?.publicHost ?? null)
    if (!isAllowedHost(host, allowedHosts) && !isAllowedHost(host, publicHosts)) {
      return reply.code(403).send({ error: 'Forbidden host' })
    }
    return undefined
  })

  registerRemoteGate(app, deps.remote)

  // Applies to every socket; terminal input is the largest client message.
  await app.register(fastifyWebsocket, { options: { maxPayload: TERMINAL_MAX_PAYLOAD } })

  app.get('/api/health', { config: { access: { area: 'unpaired' } } }, () => ({
    ok: true,
    version: deps.version,
  }))

  registerEventsRoute(app, deps.events, allowedHosts, deps.remote)
  registerRemoteRoutes(app, deps.remote)
  registerPushRoutes(app, deps.remote, deps.settings)
  registerBoardRoutes(app, deps.board, deps.prs)
  registerWorkRoutes(app, deps)
  registerNoticeRoutes(app, deps.notices)
  registerSettingsRoutes(app, deps.settings)
  registerTimesheetRoutes(app, deps.timesheet)
  registerWorkspaceRoutes(app, deps.workspace)
  registerWorkspaceFilesRoutes(app, deps.workspace)
  registerChatRoutes(app, deps.workspace)
  registerTeamsRoutes(app, deps.teams, deps.teamsWatcher)
  registerTerminalRoute(app, deps.workspace, allowedHosts)
  await registerHookRoute(app, deps.workspace)

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
