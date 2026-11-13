import type { FastifyInstance } from 'fastify'
import type { WorkspaceService } from '../workspace/workspaceService.js'

const HOOK_BODY_LIMIT = 8 * 1024 * 1024

function parseBody(body: unknown): unknown {
  if (typeof body !== 'string') {
    return null
  }
  try {
    return JSON.parse(body) as unknown
  } catch {
    return null
  }
}

// Local-only (no config.access). The body is read raw so a malformed payload still gets 200 and claude is never blocked.
export async function registerHookRoute(
  app: FastifyInstance,
  workspace: WorkspaceService,
): Promise<void> {
  await app.register((scope, _options, done) => {
    scope.removeAllContentTypeParsers()
    scope.addContentTypeParser(
      '*',
      { parseAs: 'string', bodyLimit: HOOK_BODY_LIMIT },
      (_request, body, parsed) => {
        parsed(null, body)
      },
    )
    scope.post<{ Params: { token: string; session: string } }>(
      '/api/hooks/:token/:session',
      { bodyLimit: HOOK_BODY_LIMIT },
      async (request, reply) => {
        const { token, session } = request.params
        const accepted = await workspace.onHook(session, token, parseBody(request.body))
        if (!accepted) {
          return reply.code(404).send({ error: 'Not found' })
        }
        return {}
      },
    )
    done()
  })
}
