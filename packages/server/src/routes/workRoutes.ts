import { isTicketKey, todayIn } from '@workday/core'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { BoardService } from '../board/boardService.js'
import type { TicketUpdateService } from '../jira/ticketUpdates.js'
import type { PrService } from '../prs/prService.js'
import type { SettingsService } from '../settings/settingsService.js'
import type { SuggestionService } from '../suggestions/suggestionService.js'
import type { TimesheetService } from '../timesheet/timesheetService.js'
import type { TeamsWatcher } from '../teams/teamsWatcher.js'
import { buildWorkView } from '../work/workView.js'
import { qcBugsOf } from '../workspace/bugFixes.js'
import { BugFixer } from '../workspace/fixBug.js'
import type { WorkspaceService } from '../workspace/workspaceService.js'

export interface WorkRouteDeps {
  readonly board: BoardService
  readonly prs: PrService
  readonly settings: SettingsService
  readonly workspace: WorkspaceService
  readonly suggestions: SuggestionService
  readonly teamsWatcher: TeamsWatcher
  readonly ticketUpdates: TicketUpdateService
  readonly timesheet: TimesheetService
}

function fail(reply: FastifyReply, status: number, code: string): FastifyReply {
  return reply.code(status).send({ ok: false, error: { code } })
}

export function registerWorkRoutes(
  app: FastifyInstance,
  deps: WorkRouteDeps,
  logError: (message: string, error: unknown) => void = console.error,
): void {
  const { board, prs, settings, workspace, suggestions, teamsWatcher, ticketUpdates, timesheet } =
    deps
  const bugFixer = new BugFixer({
    board,
    workspace,
    timesheet,
    devRepoPath: () => settings.view().config.workspace.devRepoPath,
    logError,
  })

  app.get('/api/work', () => {
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
      dbReviews: teamsWatcher.dbReviewApprovals(),
      ticketUpdates: ticketUpdates.view(),
      qcBugs: qcBugsOf(board.snapshot()),
      bugFixes: teamsWatcher.bugFixesToAnswer(),
    })
  })

  app.post<{ Params: { key: string } }>('/api/work/ready-to-test/:key', async (request, reply) => {
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
  })

  app.post<{ Params: { key: string } }>('/api/work/comments/:key/seen', async (request, reply) => {
    const { key } = request.params
    if (!isTicketKey(key)) {
      return fail(reply, 400, 'invalidKey')
    }
    if (settings.pullRequests === null) {
      return fail(reply, 409, 'adoNotConfigured')
    }
    await prs.markCommentsSeen(key)
    return { ok: true }
  })

  app.post<{ Params: { repo: string; id: string } }>(
    '/api/work/reviews/:repo/:id/hide',
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

  // Hands the QC bug to its parent's Claude session; a refusal changes nothing.
  app.post<{ Params: { key: string } }>('/api/work/bugs/:key/fix', async (request, reply) => {
    const { key } = request.params
    if (!isTicketKey(key)) {
      return fail(reply, 400, 'invalidKey')
    }
    const outcome = await bugFixer.fix(key)
    if (!outcome.ok && outcome.error.code === 'notABug') {
      return reply.code(404).send(outcome)
    }
    if (!outcome.ok && outcome.error.code === 'busy') {
      return reply.code(409).send(outcome)
    }
    return outcome
  })

  app.post<{ Params: { key: string } }>(
    '/api/work/suggestions/:key/hide',
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
