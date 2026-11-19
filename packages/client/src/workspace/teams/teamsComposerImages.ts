import { MAX_IMAGE_BYTES, MAX_IMAGES } from '@workday/core'
import { t } from '../../i18n.js'
import type { PickedImage } from './teamsComposerDom.js'

const IMAGE_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/gif'])
const BYTES_PER_MB = 1024 * 1024

function isPickable(file: File): boolean {
  return IMAGE_TYPES.has(file.type)
}

// Every image the clipboard or a drop carries, even a type that will be refused with a reason.
export function imageFiles(list: FileList | undefined): readonly File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith('image/'))
}

// The reason a file may not join the message, or null.
export function imageProblem(file: File, already: number): string | null {
  if (!isPickable(file)) {
    return t('teams.isNotAPngJpegOr', { name: file.name })
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return t('teams.isLargerThanMb', {
      name: file.name,
      megabytes: String(MAX_IMAGE_BYTES / BYTES_PER_MB),
    })
  }
  return already >= MAX_IMAGES ? t('teams.atMostImages', { MAX_IMAGES: String(MAX_IMAGES) }) : null
}

export function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.onerror = () => {
      reject(new Error('read failed'))
    }
    reader.readAsDataURL(file)
  })
}

function naturalSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      resolve({ width: 1, height: 1 })
    }
    image.src = dataUrl
  })
}

export async function pickImage(file: File, id: number): Promise<PickedImage> {
  const dataUrl = await readDataUrl(file)
  const { width, height } = await naturalSize(dataUrl)
  return {
    id,
    dataUrl,
    data: dataUrl.slice(dataUrl.indexOf(',') + 1),
    contentType: file.type,
    fileName: file.name === '' ? 'image.png' : file.name,
    width,
    height,
  }
}
