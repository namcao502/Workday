import { isTicketKey, todayIn } from '@workday/core'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { BoardService } from '../board/boardService.js'
import type { PrService } from '../prs/prService.js'
import type { SettingsService } from '../settings/settingsService.js'
import type { SuggestionService } from '../suggestions/suggestionService.js'
import type { TeamsWatcher } from '../teams/teamsWatcher.js'
import { buildWorkView } from '../work/workView.js'
import type { WorkspaceService } from '../workspace/workspaceService.js'

const BOARD_VIEW = { config: { access: { area: 'board', level: 'view' } } } as const
const BOARD_ACT = { config: { access: { area: 'board', level: 'act' } } } as const

export interface WorkRouteDeps {
  readonly board: BoardService
  readonly prs: PrService
  readonly settings: SettingsService
  readonly workspace: WorkspaceService
  readonly suggestions: SuggestionService
  readonly teamsWatcher: TeamsWatcher
}

function fail(reply: FastifyReply, status: number, code: string): FastifyReply {
  return reply.code(status).send({ ok: false, error: { code } })
}

export function registerWorkRoutes(
  app: FastifyInstance,
  deps: WorkRouteDeps,
  logError: (message: string, error: unknown) => void = console.error,
): void {
  const { board, prs, settings, workspace, suggestions, teamsWatcher } = deps

  app.get('/api/work', BOARD_VIEW, () => {
    const { config } = settings.view()
    const { tabs, sessions } = workspace.view()
    return buildWorkView({
      board: board.snapshot(),
      today: todayIn(config.timeZone, new Date()),
      jira: config.jira,
      ado: config.azureDevOps,
      adoConnected: settings.pullRequests !== null,
      prs: prs.state(),
      lastPrCheck: prs.lastCheck(),
      sessions,
      tabs,
      suggestions: suggestions.view(),
      teams: teamsWatcher.items(),
    })
  })

  app.post<{ Params: { key: string } }>(
    '/api/work/ready-to-test/:key',
    BOARD_ACT,
    async (request, reply) => {
      const { key } = request.params
      if (!isTicketKey(key)) {
        return fail(reply, 400, 'invalidKey')
      }
      if (!board.isConnected()) {
        return fail(reply, 409, 'notConnected')
      }
      try {
        return await prs.readyToTest(key)
      } catch (error: unknown) {
        logError(`Moving ${key} to ready to test failed`, error)
        return fail(reply, 500, 'jiraUnreachable')
      }
    },
  )

  app.post<{ Params: { key: string } }>(
    '/api/work/comments/:key/seen',
    BOARD_ACT,
    async (request, reply) => {
      const { key } = request.params
      if (!isTicketKey(key)) {
        return fail(reply, 400, 'invalidKey')
      }
      if (settings.pullRequests === null) {
        return fail(reply, 409, 'adoNotConfigured')
      }
      await prs.markCommentsSeen(key)
      return { ok: true }
    },
  )

  app.post<{ Params: { repo: string; id: string } }>(
    '/api/work/reviews/:repo/:id/hide',
    BOARD_ACT,
    async (request, reply) => {
      const { repo, id } = request.params
      if (repo === '' || !/^\d+$/.test(id)) {
        return fail(reply, 400, 'invalidKey')
      }
      if (settings.pullRequests === null) {
        return fail(reply, 409, 'adoNotConfigured')
      }
      await prs.hideReview(`${repo}|${id}`)
      return { ok: true }
    },
  )

  app.post<{ Params: { key: string } }>(
    '/api/work/suggestions/:key/take',
    BOARD_ACT,
    async (request, reply) => {
      const { key } = request.params
      if (!isTicketKey(key)) {
        return fail(reply, 400, 'invalidKey')
      }
      if (!board.isConnected()) {
        return fail(reply, 409, 'notConnected')
      }
      try {
        return await suggestions.take(key)
      } catch (error: unknown) {
        logError(`Taking ${key} failed`, error)
        return fail(reply, 500, 'jiraUnreachable')
      }
    },
  )

  app.post<{ Params: { key: string } }>(
    '/api/work/suggestions/:key/hide',
    BOARD_ACT,
    async (request, reply) => {
      const { key } = request.params
      if (!isTicketKey(key)) {
        return fail(reply, 400, 'invalidKey')
      }
      await suggestions.hide(key)
      return { ok: true }
    },
  )
}
