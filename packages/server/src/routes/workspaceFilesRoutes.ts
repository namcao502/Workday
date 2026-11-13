import { readFile, stat } from 'node:fs/promises'
import {
  isTicketKey,
  type AppError,
  type ChangeGroupView,
  type DiffView,
  type FileContentView,
  type FilesGroupView,
} from '@workday/core'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { isRecord } from '../jsonFile.js'
import type { FileGroup } from '../workspace/fileGroups.js'
import { bugSuffix, listChanges, readDiff } from '../workspace/gitChanges.js'
import {
  imageMimeType,
  listDocs,
  listWorktree,
  MAX_IMAGE_BYTES,
  PathOutsideError,
  readTicketFile,
  resolveInside,
} from '../workspace/ticketFiles.js'
import type { WorkspaceService } from '../workspace/workspaceService.js'

const GIT_FAILED: AppError = { code: 'gitFailed' }
const PATH_OUTSIDE = { ok: false, error: { code: 'pathOutside' } } as const

interface FileQuery {
  readonly group?: string
  readonly path?: string
}

function worktreeGroupOf(groups: readonly FileGroup[], id: string | undefined): FileGroup | undefined {
  return groups.find((group) => group.id === id && group.kind === 'worktree')
}

// Local-only like the other workspace routes: none declares config.access.
export function registerWorkspaceFilesRoutes(
  app: FastifyInstance,
  workspace: WorkspaceService,
): void {
  const notFound = (response: FastifyReply, what: string): FastifyReply =>
    response.code(404).send({ error: `Unknown ${what}` })

  app.get<{ Params: { id: string } }>('/api/workspace/tabs/:id/changes', async (request, response) => {
    const groups = await workspace.fileGroups(request.params.id)
    if (groups === null) {
      return notFound(response, 'tab')
    }
    const ticketKey = isTicketKey(request.params.id) ? request.params.id : null
    const views: ChangeGroupView[] = []
    for (const group of groups.filter((item) => item.kind === 'worktree')) {
      const set = await listChanges(group.root, ticketKey, workspace.localOnlyPaths())
      views.push(
        set === null
          ? { id: group.id, label: group.label, files: [], error: GIT_FAILED }
          : { id: group.id, label: group.label + bugSuffix(set), files: set.files, error: null },
      )
    }
    return views
  })

  app.get<{ Params: { id: string }; Querystring: FileQuery }>(
    '/api/workspace/tabs/:id/changes/diff',
    async (request, response): Promise<DiffView | FastifyReply> => {
      const groups = await workspace.fileGroups(request.params.id)
      if (groups === null) {
        return notFound(response, 'tab')
      }
      const group = worktreeGroupOf(groups, request.query.group)
      if (group === undefined) {
        return notFound(response, 'group')
      }
      const path = request.query.path
      try {
        await resolveInside(group.root, typeof path === 'string' ? path : '')
        const ticketKey = isTicketKey(request.params.id) ? request.params.id : null
        const set = await listChanges(group.root, ticketKey, workspace.localOnlyPaths())
        if (set === null) {
          return await response.code(500).send({ ok: false, error: GIT_FAILED })
        }
        const file = set.files.find((item) => item.path === path)
        if (file === undefined) {
          return await notFound(response, 'file')
        }
        return await readDiff(group.root, set, file)
      } catch (error: unknown) {
        if (error instanceof PathOutsideError) {
          return response.code(400).send(PATH_OUTSIDE)
        }
        throw error
      }
    },
  )

  app.get<{ Params: { id: string } }>('/api/workspace/tabs/:id/files', async (request, response) => {
    const groups = await workspace.fileGroups(request.params.id)
    if (groups === null) {
      return notFound(response, 'tab')
    }
    return Promise.all(
      groups.map(async (group): Promise<FilesGroupView> => {
        const paths = group.kind === 'docs' ? await listDocs(group.root) : await listWorktree(group.root)
        return paths === null
          ? { id: group.id, label: group.label, paths: [], error: GIT_FAILED }
          : { id: group.id, label: group.label, paths, error: null }
      }),
    )
  })

  // The path of a file read: 404 for an unknown tab / group, 400 for an unsafe path.
  const resolveFile = async (
    id: string,
    query: FileQuery,
    response: FastifyReply,
  ): Promise<string | FastifyReply> => {
    const groups = await workspace.fileGroups(id)
    if (groups === null) {
      return notFound(response, 'tab')
    }
    const group = groups.find((item) => item.id === query.group)
    if (group === undefined) {
      return notFound(response, 'group')
    }
    try {
      return await resolveInside(group.root, typeof query.path === 'string' ? query.path : '')
    } catch (error: unknown) {
      if (error instanceof PathOutsideError) {
        return response.code(400).send(PATH_OUTSIDE)
      }
      throw error
    }
  }

  app.get<{ Params: { id: string }; Querystring: FileQuery }>(
    '/api/workspace/tabs/:id/files/content',
    async (request, response): Promise<FileContentView | FastifyReply> => {
      const full = await resolveFile(request.params.id, request.query, response)
      if (typeof full !== 'string') {
        return full
      }
      try {
        return await readTicketFile(full)
      } catch {
        return notFound(response, 'file')
      }
    },
  )

  app.get<{ Params: { id: string }; Querystring: FileQuery }>(
    '/api/workspace/tabs/:id/files/raw',
    async (request, response) => {
      const full = await resolveFile(request.params.id, request.query, response)
      if (typeof full !== 'string') {
        return full
      }
      const mimeType = imageMimeType(full)
      if (mimeType === null) {
        return response.code(400).send({ error: 'Only images are served raw' })
      }
      try {
        if ((await stat(full)).size > MAX_IMAGE_BYTES) {
          return await response.code(413).send({ error: 'Image is too large' })
        }
        const bytes = await readFile(full)
        // An svg may carry script: the CSP sandbox and nosniff keep it inert even when opened directly.
        return await response
          .header('content-type', mimeType)
          .header('x-content-type-options', 'nosniff')
          .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
          .header('cache-control', 'no-store')
          .send(bytes)
      } catch {
        return notFound(response, 'file')
      }
    },
  )

  app.post('/api/workspace/vscode', async (request, response) => {
    const body = request.body
    const tabId = isRecord(body) ? body['tabId'] : undefined
    const groupId = isRecord(body) ? body['group'] : undefined
    const path = isRecord(body) ? body['path'] : undefined
    if (typeof tabId !== 'string') {
      return response.code(400).send({ error: 'Body must be { tabId, group?, path? }' })
    }
    const groups = await workspace.fileGroups(tabId)
    if (groups === null) {
      return notFound(response, 'tab')
    }
    const group =
      typeof groupId === 'string'
        ? groups.find((item) => item.id === groupId)
        : groups.find((item) => item.kind === 'worktree')
    if (group === undefined) {
      return notFound(response, 'group')
    }
    try {
      const target = typeof path === 'string' ? await resolveInside(group.root, path) : group.root
      return { ok: await workspace.openEditor(target) }
    } catch (error: unknown) {
      if (error instanceof PathOutsideError) {
        return response.code(400).send(PATH_OUTSIDE)
      }
      throw error
    }
  })
}
