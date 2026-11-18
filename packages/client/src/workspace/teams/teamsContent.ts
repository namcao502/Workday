import { fullSizeImageUrl, isAmsImageUrl, safeHtml } from '@workday/core'
import DOMPurify from 'dompurify'
import { teamsImageSrc } from '../../api/teamsApi.js'
import { ctrlLinkHint } from '../../ui/ctrlLink.js'
import { highlightAuto } from '../../ui/highlight.js'

const FULL_SIZE_ATTRIBUTE = 'data-full-size'

// Core's allow-list, then DOMPurify, in an inert document. Code is coloured in the thread only, never the composer.
export function renderTeamsHtml(
  content: string,
  isPlainText: boolean,
  highlightCode = false,
): string {
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
    link.setAttribute('title', ctrlLinkHint())
  }
  if (highlightCode) {
    for (const block of parsed.body.querySelectorAll('pre')) {
      // highlightAuto escapes the text; the only markup it adds is highlight.js spans.
      block.innerHTML = `<code>${highlightAuto(block.textContent)}</code>`
    }
  }
  return parsed.body.innerHTML
}

// The full-size proxy URL of a message image, or null when Teams had no larger copy.
export function fullImageSrc(image: HTMLImageElement): string | null {
  const full = image.getAttribute(FULL_SIZE_ATTRIBUTE)
  return full === null ? null : teamsImageSrc(full)
}

export function nameColor(name: string): string {
  let hash = 0
  for (const char of name) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360
  }
  return `hsl(${String(hash)} 55% 42%)`
}
