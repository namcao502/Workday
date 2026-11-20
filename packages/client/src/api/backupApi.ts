import type { BackupImportResult } from '@workday/core'
import { isRecord } from '../json.js'
import {
  ApiError,
  clientHeaders,
  isPlainCode,
  noteTakeover,
  send,
  type PlainCode,
} from './client.js'

const EXPORT_PATH = '/api/backup/export'
const IMPORT_PATH = '/api/backup/import'
const UNAUTHORIZED = 401
const FILENAME_PATTERN = /filename="([^"]+)"/

export interface BackupDownload {
  readonly blob: Blob
  readonly filename: string
}

function codeOf(body: unknown): PlainCode | null {
  const error = isRecord(body) ? body['error'] : undefined
  const code = isRecord(error) ? error['code'] : undefined
  return isPlainCode(code) ? code : null
}

// A refusal carries its AppError code, so the caller can translate it.
async function failureOf(response: Response, path: string): Promise<ApiError> {
  if (response.status === UNAUTHORIZED) {
    return new ApiError(UNAUTHORIZED, path, 'notPaired')
  }
  const body: unknown = await response.json().catch(() => null)
  noteTakeover(response.status, body)
  return new ApiError(response.status, path, codeOf(body))
}

export async function exportBackup(password: string): Promise<BackupDownload> {
  const response = await fetch(EXPORT_PATH, {
    method: 'POST',
    headers: { ...clientHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!response.ok) {
    throw await failureOf(response, EXPORT_PATH)
  }
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const filename = FILENAME_PATTERN.exec(disposition)?.[1] ?? 'workday-backup.wdbackup'
  return { blob: await response.blob(), filename }
}

export async function importBackup(password: string, data: string): Promise<BackupImportResult> {
  const raw = await send('POST', IMPORT_PATH, { password, data })
  if (!raw.ok) {
    throw new ApiError(raw.status, IMPORT_PATH, codeOf(raw.body))
  }
  const files = isRecord(raw.body) ? raw.body['files'] : undefined
  if (!Array.isArray(files) || !files.every((file) => typeof file === 'string')) {
    throw new ApiError(raw.status, IMPORT_PATH)
  }
  return { files }
}
