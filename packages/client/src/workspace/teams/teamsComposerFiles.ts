import { MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_FILE_BYTES } from '@workday/core'
import { t } from '../../i18n.js'
import { readDataUrl } from './teamsComposerImages.js'

const BYTES_PER_MB = 1024 * 1024
const BYTES_PER_KB = 1024

export interface AttachedFile {
  readonly id: number
  readonly name: string
  readonly size: number
  readonly data: string // base64
}

// The reason a file may not join the message, or null.
export function fileProblem(file: File, attached: readonly AttachedFile[]): string | null {
  if (file.size === 0) {
    return t('teams.isEmpty', { name: file.name })
  }
  if (file.size > MAX_FILE_BYTES) {
    const limit = String(MAX_FILE_BYTES / BYTES_PER_MB)
    return t('teams.isOverMb', { name: file.name, limit })
  }
  if (attached.length >= MAX_FILES) {
    const limit = String(MAX_FILES)
    return t('teams.atMostFilesPerMessage', { limit })
  }
  const total = attached.reduce((sum, item) => sum + item.size, 0) + file.size
  if (total > MAX_TOTAL_FILE_BYTES) {
    const limit = String(MAX_TOTAL_FILE_BYTES / BYTES_PER_MB)
    return t('teams.filesTogetherMayBeAtMost', { limit })
  }
  return null
}

export async function readAttached(file: File, id: number): Promise<AttachedFile> {
  const dataUrl = await readDataUrl(file)
  return { id, name: file.name, size: file.size, data: dataUrl.slice(dataUrl.indexOf(',') + 1) }
}

export function sizeText(bytes: number): string {
  return bytes >= BYTES_PER_MB
    ? `${(bytes / BYTES_PER_MB).toFixed(1)} MB`
    : `${String(Math.max(1, Math.round(bytes / BYTES_PER_KB)))} KB`
}
