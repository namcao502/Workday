import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { CleanupError, CleanupOutcome, CleanupView } from '@workday/core'
import { isRecord } from '../json.js'
import { ApiError, hasOkFlag, queryKeys, send } from './client.js'

const CLEANUP_PATH = '/api/workspace/cleanup'

const ERROR_CODES: ReadonlySet<string> = new Set([
  'invalidKey',
  'workspaceNotConfigured',
  'stateChanged',
  'hasWorktree',
  'ioFailed',
  'kept',
  'worktreeUnreadable',
  'worktreeFailed',
])

function isCleanupError(value: unknown): value is CleanupError {
  return isRecord(value) && typeof value['code'] === 'string' && ERROR_CODES.has(value['code'])
}

export async function getCleanup(): Promise<CleanupView> {
  const raw = await send('GET', CLEANUP_PATH)
  if (!raw.ok || !isRecord(raw.body) || !Array.isArray(raw.body['rows'])) {
    throw new ApiError(raw.status, CLEANUP_PATH)
  }
  return raw.body as unknown as CleanupView
}

// A refusal is a 200 `{ ok: false, error }`; a bad key (400) throws.
async function post(path: string, payload?: unknown): Promise<CleanupOutcome> {
  const raw = await send('POST', path, payload)
  if (!raw.ok || !hasOkFlag(raw.body)) {
    throw new ApiError(raw.status, path)
  }
  if (raw.body.ok) {
    return { ok: true }
  }
  const error = raw.body['error']
  if (!isCleanupError(error)) {
    throw new ApiError(raw.status, path)
  }
  return { ok: false, error }
}

function keyPath(key: string, action: string): string {
  return `${CLEANUP_PATH}/${encodeURIComponent(key)}/${action}`
}

export function removeWorktree(key: string, dirtyFiles: number): Promise<CleanupOutcome> {
  return post(keyPath(key, 'remove'), { dirtyFiles })
}

export function slimDocs(key: string): Promise<CleanupOutcome> {
  return post(keyPath(key, 'slim'))
}

export function useCleanup(): UseQueryResult<CleanupView> {
  return useQuery({ queryKey: queryKeys.workspaceCleanup, queryFn: getCleanup })
}

export interface CleanupRun {
  readonly kind: 'remove' | 'slim'
  readonly key: string
  readonly dirtyFiles: number
}

// Refetches the list and the workspace view, so a removed worktree drops out of both.
export function useCleanupRun(): (run: CleanupRun) => Promise<CleanupOutcome> {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (run: CleanupRun) =>
      run.kind === 'remove' ? removeWorktree(run.key, run.dirtyFiles) : slimDocs(run.key),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspace })
    },
  })
  return mutation.mutateAsync
}
