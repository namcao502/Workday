import type { CleanupOutcome, CleanupView } from '@workday/core'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { isRecord } from '../jsonFile.js'
import type { WorktreeCleanupService } from '../workspace/worktreeCleanup.js'

function dirtyFilesOf(body: unknown): number | null {
  if (!isRecord(body)) {
    return null
  }
  const dirtyFiles = body['dirtyFiles']
  return typeof dirtyFiles === 'number' && Number.isInteger(dirtyFiles) && dirtyFiles >= 0
    ? dirtyFiles
    : null
}

// A refusal is a 200 with ok: false, like the other outcomes; only a malformed key is a 400.
function outcomeReply(outcome: CleanupOutcome, response: FastifyReply): unknown {
  return !outcome.ok && outcome.error.code === 'invalidKey'
    ? response.code(400).send(outcome)
    : outcome
}

// Local-only like the workspace routes: none declares config.access, so a paired device gets a 403.
export function registerCleanupRoutes(app: FastifyInstance, cleanup: WorktreeCleanupService): void {
  app.get('/api/workspace/cleanup', async (): Promise<CleanupView> => ({
    rows: await cleanup.rows(),
  }))

  app.post<{ Params: { key: string } }>(
    '/api/workspace/cleanup/:key/remove',
    async (request, response) => {
      const dirtyFiles = dirtyFilesOf(request.body)
      if (dirtyFiles === null) {
        return response.code(400).send({ error: 'Body must be { dirtyFiles: number }' })
      }
      return outcomeReply(await cleanup.remove(request.params.key, dirtyFiles), response)
    },
  )

  app.post<{ Params: { key: string } }>(
    '/api/workspace/cleanup/:key/slim',
    async (request, response) => outcomeReply(await cleanup.slim(request.params.key), response),
  )
}
