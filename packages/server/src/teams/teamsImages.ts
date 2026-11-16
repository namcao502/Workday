// The images of a draft: checked here (the browser is not trusted), then uploaded before the message is built.
import {
  buildBody,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  MAX_TOTAL_IMAGE_BYTES,
  type TeamsDraft,
  type TeamsImageUpload,
  type TeamsMessageBody,
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

export type ImageOutcome =
  { readonly kind: 'invalid' } | { readonly kind: 'body'; readonly body: TeamsMessageBody }

// Refuses an empty or bad message before anything is uploaded; one upload per image, in order.
export async function bodyWithImages(
  chat: TeamsGateway,
  conversationId: string,
  draft: TeamsDraft,
): Promise<ImageOutcome> {
  const images = decodeImages(draft)
  const placeholders = (images ?? []).map((_, index) => `pending-${String(index)}`)
  if (images === null || buildBody(draft, placeholders) === null) {
    return { kind: 'invalid' }
  }
  const uploaded: string[] = []
  for (const image of images) {
    uploaded.push(await chat.uploadImage(conversationId, image))
  }
  const body = buildBody(draft, uploaded)
  return body === null ? { kind: 'invalid' } : { kind: 'body', body }
}
