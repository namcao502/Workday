import { isAbsolute } from 'node:path'
import type { OpenOutcome, StartOutcome } from '@workday/core'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { isRecord } from '../jsonFile.js'
import { isDirectory } from '../workspace/sessionHost.js'
import type { WorkspaceOutcome, WorkspaceService } from '../workspace/workspaceService.js'

const SESSION_NOT_FOUND = { ok: false, error: { code: 'sessionNotFound' } } as const

// undefined = invalid; null = the dev repo.
function parseFolder(body: unknown): string | null | undefined {
  if (!isRecord(body)) {
    return undefined
  }
  const folder = body['folder']
  if (folder === null) {
    return null
  }
  return typeof folder === 'string' && isAbsolute(folder) && isDirectory(folder)
    ? folder
    : undefined
}

// All local-only: none declares config.access, so the remote gate answers 403 to a paired device.
export function registerWorkspaceRoutes(app: FastifyInstance, workspace: WorkspaceService): void {
  const reply = (outcome: WorkspaceOutcome, response: FastifyReply): unknown => {
    if (outcome === 'notFound') {
      return response.code(404).send(SESSION_NOT_FOUND)
    }
    if (outcome === 'mainSession') {
      return response.code(409).send({ error: 'The main session closes with its tab' })
    }
    return workspace.view()
  }

  app.get('/api/workspace', () => workspace.view())

  app.post('/api/workspace/terminals', async (request, response) => {
    const folder = parseFolder(request.body)
    if (folder === undefined) {
      return response
        .code(400)
        .send({ error: 'Body must be { folder: absolute folder path | null }' })
    }
    await workspace.addTerminal(folder)
    return workspace.view()
  })

  // A refusal is a 200 with ok: false, like the other outcomes; only a malformed key is a 400.
  const outcomeReply = (outcome: StartOutcome | OpenOutcome, response: FastifyReply): unknown =>
    !outcome.ok && 'error' in outcome && outcome.error.code === 'invalidKey'
      ? response.code(400).send(outcome)
      : outcome

  app.post<{ Params: { key: string } }>('/api/workspace/start/:key', async (request, response) =>
    outcomeReply(await workspace.start(request.params.key), response),
  )

  app.post<{ Params: { key: string } }>('/api/workspace/open/:key', async (request, response) => {
    const recreate = isRecord(request.body) && request.body['recreate'] === true
    return outcomeReply(await workspace.open(request.params.key, recreate), response)
  })

  app.delete<{ Params: { id: string } }>('/api/workspace/tabs/:id', async (request, response) =>
    reply(await workspace.closeTab(request.params.id), response),
  )

  app.post<{ Params: { id: string } }>(
    '/api/workspace/tabs/:id/sessions',
    async (request, response) => reply(await workspace.addSession(request.params.id), response),
  )

  app.delete<{ Params: { name: string } }>(
    '/api/workspace/sessions/:name',
    async (request, response) => reply(await workspace.closeSession(request.params.name), response),
  )

  app.post<{ Params: { name: string } }>(
    '/api/workspace/sessions/:name/seen',
    (request, response) => {
      if (!workspace.hasSession(request.params.name)) {
        return response.code(404).send(SESSION_NOT_FOUND)
      }
      workspace.seen(request.params.name)
      return workspace.view()
    },
  )
}
