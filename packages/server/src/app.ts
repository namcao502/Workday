import { existsSync } from 'node:fs'
import type { Server } from 'node:https'
import { basename, join } from 'node:path'
import fastifyStatic from '@fastify/static'
import fastifyWebsocket from '@fastify/websocket'
import Fastify, { type FastifyInstance } from 'fastify'
import type { BoardService } from './board/boardService.js'
import type { FirewallResult } from './remote/firewall.js'
import type { PrService } from './prs/prService.js'
import type { EventHub } from './events.js'
import type { ReportReader } from './insights/reportReader.js'
import type { NoticeService } from './notices/noticeService.js'
import { registerBackupRoutes } from './routes/backupRoutes.js'
import { registerBoardRoutes } from './routes/boardRoutes.js'
import { registerNoticeRoutes } from './routes/noticeRoutes.js'
import { registerRemoteGate, type VpnSurface } from './remote/remoteGate.js'
import type { RemoteService } from './remote/remoteService.js'
import { registerEventsRoute } from './routes/eventsRoute.js'
import { registerInsightsRoutes } from './routes/insightsRoutes.js'
import { registerPushRoutes } from './routes/pushRoutes.js'
import { registerRemoteRoutes } from './routes/remoteRoutes.js'
import { registerSchedulesRoutes } from './routes/schedulesRoutes.js'
import type { SchedulesSource } from './schedules/schedulesView.js'
import { registerSettingsRoutes } from './routes/settingsRoutes.js'
import { registerTeamsRoutes } from './routes/teamsRoutes.js'
import type { DaySuggestionsSource } from './timesheet/daySuggestions.js'
import { registerTimesheetRoutes } from './routes/timesheetRoutes.js'
import { registerCleanupRoutes } from './routes/cleanupRoutes.js'
import { registerChatRoutes } from './routes/chatRoute.js'
import { registerWorkRoutes } from './routes/workRoutes.js'
import { registerWorkspaceFilesRoutes } from './routes/workspaceFilesRoutes.js'
import { registerWorkspaceRoutes } from './routes/workspaceRoutes.js'
import { allowedHostHeaders, isAllowedHost, remoteHostHeaders } from './security/allowedHosts.js'
import type { TicketUpdateService } from './jira/ticketUpdates.js'
import type { SettingsService } from './settings/settingsService.js'
import type { SuggestionService } from './suggestions/suggestionService.js'
import type { TeamsService } from './teams/teamsService.js'
import type { TeamsWatcher } from './teams/teamsWatcher.js'
import type { TimesheetService } from './timesheet/timesheetService.js'
import type { WorkspaceService } from './workspace/workspaceService.js'
import type { WorktreeCleanupService } from './workspace/worktreeCleanup.js'

const SOCKET_MAX_PAYLOAD = 1024 * 1024

export interface AppDeps {
  port: number
  dev: boolean
  dataDir: string
  version: string
  // Built client folder; the SPA fallback is active only when it exists.
  clientDist?: string | undefined
  board: BoardService
  prs: PrService
  suggestions: SuggestionService
  settings: SettingsService
  timesheet: TimesheetService
  daySuggestions: DaySuggestionsSource
  events: EventHub
  remote: RemoteService
  notices: NoticeService
  ticketUpdates: TicketUpdateService
  workspace: WorkspaceService
  cleanup: WorktreeCleanupService
  teams: TeamsService
  teamsWatcher: TeamsWatcher
  insights: ReportReader
  schedules: SchedulesSource
  // Set on the VPN instance: HTTPS, and `vpn.host` is the only Host it accepts.
  vpn?: VpnSurface | undefined
  // Tests pass a fake so no real elevated PowerShell starts.
  openFirewall?: ((command: string) => Promise<FirewallResult>) | undefined
}

export async function createApp(deps: AppDeps): Promise<FastifyInstance> {
  const { vpn } = deps
  const app: FastifyInstance = vpn === undefined ? Fastify() : Fastify<Server>({ https: vpn.tls })
  const allowedHosts = allowedHostHeaders({ port: deps.port, dev: deps.dev })

  // Blocks DNS rebinding: a page on another domain pointed at 127.0.0.1 sends its own Host.
  app.addHook('onRequest', async (request, reply) => {
    const { host } = request.headers
    if (vpn !== undefined) {
      return isAllowedHost(host, new Set([vpn.host]))
        ? undefined
        : reply.code(403).send({ error: 'Forbidden host' })
    }
    const publicHosts = remoteHostHeaders(deps.remote.config?.publicHost ?? null)
    if (!isAllowedHost(host, allowedHosts) && !isAllowedHost(host, publicHosts)) {
      return reply.code(403).send({ error: 'Forbidden host' })
    }
    return undefined
  })

  registerRemoteGate(app, deps.remote, vpn ?? null)

  // One screen on this PC: the app wins. A header-less request (curl, tests) still passes.
  app.addHook('onRequest', async (request, reply) => {
    const isApi = request.url.startsWith('/api/') && !request.url.startsWith('/api/events')
    if (
      isApi &&
      !request.isRemote &&
      request.headers['x-workday-client'] === 'web' &&
      deps.events.hasLocalApp()
    ) {
      return reply.code(409).send({ ok: false, error: { code: 'sessionInApp' } })
    }
    return undefined
  })

  await app.register(fastifyWebsocket, { options: { maxPayload: SOCKET_MAX_PAYLOAD } })

  app.get('/api/health', { config: { access: { area: 'unpaired' } } }, () => ({
    ok: true,
    version: deps.version,
  }))

  registerEventsRoute(app, deps.events, allowedHosts, vpn === undefined ? 'loopback' : 'vpn')
  registerRemoteRoutes(app, deps.remote, deps.openFirewall)
  registerPushRoutes(app, deps.remote, deps.settings)
  registerBoardRoutes(app, deps.board, deps.prs, deps.ticketUpdates)
  registerWorkRoutes(app, deps)
  registerNoticeRoutes(app, deps.notices, deps.teamsWatcher)
  registerSettingsRoutes(app, deps.settings)
  registerTimesheetRoutes(app, deps.timesheet, deps.daySuggestions)
  registerWorkspaceRoutes(app, deps.workspace)
  registerWorkspaceFilesRoutes(app, deps.workspace)
  registerCleanupRoutes(app, deps.cleanup)
  registerChatRoutes(app, deps.workspace)
  registerTeamsRoutes(app, deps.teams, deps.teamsWatcher)
  registerInsightsRoutes(app, deps.insights, () => deps.settings.timeZone)
  registerSchedulesRoutes(app, deps.schedules)
  registerBackupRoutes(app, deps.dataDir, () => deps.settings.timeZone)

  const { clientDist } = deps
  const hasClient = clientDist !== undefined && existsSync(join(clientDist, 'index.html'))
  if (hasClient) {
    await app.register(fastifyStatic, {
      root: clientDist,
      // The browser must re-check the service worker on every load, or an update never lands.
      setHeaders: (response, path) => {
        if (basename(path) === 'sw.js') {
          void response.header('Cache-Control', 'no-cache')
        }
      },
    })
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
