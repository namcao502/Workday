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
    return t(`${file.name} is empty.`, `${file.name} đang trống.`)
  }
  if (file.size > MAX_FILE_BYTES) {
    const limit = String(MAX_FILE_BYTES / BYTES_PER_MB)
    return t(`${file.name} is over ${limit} MB.`, `${file.name} lớn hơn ${limit} MB.`)
  }
  if (attached.length >= MAX_FILES) {
    const limit = String(MAX_FILES)
    return t(`At most ${limit} files per message.`, `Tối đa ${limit} file mỗi tin.`)
  }
  const total = attached.reduce((sum, item) => sum + item.size, 0) + file.size
  if (total > MAX_TOTAL_FILE_BYTES) {
    const limit = String(MAX_TOTAL_FILE_BYTES / BYTES_PER_MB)
    return t(`Files together may be at most ${limit} MB.`, `Các file cộng lại tối đa ${limit} MB.`)
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
