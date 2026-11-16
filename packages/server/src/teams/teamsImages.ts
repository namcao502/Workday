// The images of a draft: checked here (the browser is not trusted), then uploaded before the message is built.
import {
  buildBody,
  filesJson,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  MAX_TOTAL_FILE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
  sharePointName,
  type TeamsChannel,
  type TeamsDraft,
  type TeamsImageUpload,
  type TeamsMessageBody,
  type TeamsUploadedFile,
} from '@workday/core'
import type { TeamsGateway } from './teamsChatClient.js'

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/
const MAX_FILE_NAME_LENGTH = 100
const FIRST_PRINTABLE_CODE = 32
const BACKSLASH_CODE = 92

function signatureType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif'
  }
  return null
}

function isUnsafeChar(char: string): boolean {
  return (
    char === '/' ||
    char.charCodeAt(0) === BACKSLASH_CODE ||
    char.charCodeAt(0) < FIRST_PRINTABLE_CODE
  )
}

function safeFileName(name: string): string {
  const base = Array.from(name)
    .map((char) => (isUnsafeChar(char) ? '_' : char))
    .join('')
    .trim()
  return base === '' ? 'image' : base.slice(0, MAX_FILE_NAME_LENGTH)
}

/** The decoded images, or null when any is not a PNG, JPEG or GIF within the limits. */
export function decodeImages(draft: TeamsDraft): readonly TeamsImageUpload[] | null {
  const images = draft.images ?? []
  if (images.length > MAX_IMAGES) {
    return null
  }
  const decoded: TeamsImageUpload[] = []
  let total = 0
  for (const image of images) {
    if (!BASE64.test(image.data)) {
      return null
    }
    const bytes = Buffer.from(image.data, 'base64')
    total += bytes.byteLength
    const contentType = signatureType(bytes)
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES || contentType === null) {
      return null
    }
    decoded.push({ bytes, contentType, fileName: safeFileName(image.fileName) })
  }
  return total > MAX_TOTAL_IMAGE_BYTES ? null : decoded
}

export interface FileUpload {
  readonly fileName: string
  readonly bytes: Uint8Array
}

/** The decoded files, or null when there are too many, one is empty or too big, or the total is. */
export function decodeFiles(draft: TeamsDraft): readonly FileUpload[] | null {
  const files = draft.files ?? []
  if (files.length > MAX_FILES) {
    return null
  }
  const decoded: FileUpload[] = []
  let total = 0
  for (const file of files) {
    if (!BASE64.test(file.data)) {
      return null
    }
    const bytes = Buffer.from(file.data, 'base64')
    total += bytes.byteLength
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) {
      return null
    }
    decoded.push({ fileName: sharePointName(file.fileName), bytes })
  }
  return total > MAX_TOTAL_FILE_BYTES ? null : decoded
}

export type ImageOutcome =
  { readonly kind: 'invalid' } | { readonly kind: 'body'; readonly body: TeamsMessageBody }

const EMPTY_BODY: TeamsMessageBody = {
  html: '<p>&nbsp;</p>',
  mentionsJson: null,
  amsReferences: [],
}

// Refuses an empty or bad message before anything is uploaded; then one upload per image and per file, in order.
// channel: where a channel's files go; null for a chat (the user's OneDrive); undefined for an unwatched channel.
export async function bodyWithImages(
  chat: TeamsGateway,
  conversationId: string,
  draft: TeamsDraft,
  channel: TeamsChannel | null | undefined,
): Promise<ImageOutcome> {
  const images = decodeImages(draft)
  const files = decodeFiles(draft)
  if (images === null || files === null) {
    return { kind: 'invalid' }
  }
  const placeholders = images.map((_, index) => `pending-${String(index)}`)
  const hasContent = buildBody(draft, placeholders) !== null
  // A channel's files need a watched channel to know the site and folder.
  if ((!hasContent && files.length === 0) || (files.length !== 0 && !isFileTarget(channel))) {
    return { kind: 'invalid' }
  }
  const uploaded: string[] = []
  for (const image of images) {
    uploaded.push(await chat.uploadImage(conversationId, image))
  }
  const sent: TeamsUploadedFile[] = []
  for (const file of files) {
    sent.push(await chat.uploadFile(file, channel ?? null))
  }
  const body = buildBody(draft, uploaded) ?? EMPTY_BODY
  return {
    kind: 'body',
    body: sent.length === 0 ? body : { ...body, filesJson: filesJson(sent) },
  }
}

function isFileTarget(channel: TeamsChannel | null | undefined): boolean {
  return channel !== undefined
}
