import { fullSizeImageUrl, isAmsImageUrl, safeHtml } from '@workday/core'
import DOMPurify from 'dompurify'
import { teamsImageSrc } from '../../api/teamsApi.js'

const FULL_SIZE_ATTRIBUTE = 'data-full-size'

// Core's allow-list first, then DOMPurify; an inert DOMParser document keeps the originals from loading.
export function renderTeamsHtml(content: string, isPlainText: boolean): string {
  const clean = DOMPurify.sanitize(safeHtml(content, isPlainText))
  const parsed = new DOMParser().parseFromString(clean, 'text/html')
  for (const image of parsed.body.querySelectorAll('img')) {
    // Core's safeHtml leaves the image URL in data-src; nothing loads until it is set to the proxy.
    const src = image.getAttribute('data-src') ?? ''
    if (isAmsImageUrl(src)) {
      const full = fullSizeImageUrl(src)
      if (full !== null) {
        image.setAttribute(FULL_SIZE_ATTRIBUTE, full)
      }
      image.setAttribute('src', teamsImageSrc(src))
    }
  }
  for (const link of parsed.body.querySelectorAll('a')) {
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  }
  return parsed.body.innerHTML
}

// The full-size proxy URL of a clicked preview image, or null for anything else.
export function fullSizeProxyUrl(target: EventTarget): string | null {
  if (!(target instanceof HTMLImageElement)) {
    return null
  }
  const full = target.getAttribute(FULL_SIZE_ATTRIBUTE)
  return full === null ? null : teamsImageSrc(full)
}

// A stable colour per sender name.
export function nameColor(name: string): string {
  let hash = 0
  for (const char of name) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360
  }
  return `hsl(${String(hash)} 55% 42%)`
}
