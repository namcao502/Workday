// Safe HTML or plain text from a Teams message body: output holds only tags written here and escaped text.
import { getAttribute, tokenizeTags } from './teamsTags.js'
import type { TagToken } from './teamsTags.js'

const AMS_IMAGE_URL =
  /^https:\/\/[a-z0-9-]+\.asm\.skype\.com\/v1\/objects\/[A-Za-z0-9-]+\/views\/imgo$/i
const FULL_SIZE_IMAGE_VIEW = 'imgpsh_fullsize_anim'
const BLANK_LINE_RUN = /\n{3,}/g

const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'p',
  'div',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'ul',
  'ol',
  'li',
  'pre',
  'code',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'h1',
  'h2',
  'h3',
])
const DROPPED_WITH_CONTENT_TAGS: ReadonlySet<string> = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'template',
])
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
}

interface OpenTag {
  readonly name: string
  readonly emitted: boolean
}

function codePointText(code: number): string {
  return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
}

export function htmlDecode(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X'
      return codePointText(Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10))
    }
    return NAMED_ENTITIES[body] ?? whole
  })
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function itemTypeContains(attributes: string, marker: string): boolean {
  return (getAttribute(attributes, 'itemtype') ?? '').toLowerCase().includes(marker.toLowerCase())
}

function isEmoji(attributes: string): boolean {
  return itemTypeContains(attributes, 'schema.skype.com/Emoji')
}

function amsImageUrl(attributes: string): string | null {
  const url = htmlDecode(getAttribute(attributes, 'src') ?? '').trim()
  return itemTypeContains(attributes, 'schema.skype.com/AMSImage') && isAmsImageUrl(url)
    ? url
    : null
}

export function isAmsImageUrl(url: string): boolean {
  return AMS_IMAGE_URL.test(url)
}

/** The same image as it was sent, for a viewer; null for anything but a message's preview image. */
export function fullSizeImageUrl(url: string): string | null {
  return isAmsImageUrl(url) ? url.slice(0, -'imgo'.length) + FULL_SIZE_IMAGE_VIEW : null
}

// `lower` is the lower-cased content, made once per call: lower-casing per tag would be quadratic.
export function indexAfterClosingTag(content: string, lower: string, from: number, name: string): number {
  const closeStart = lower.indexOf(`</${name}`, from)
  if (closeStart === -1) {
    return content.length
  }
  const closeEnd = content.indexOf('>', closeStart)
  return closeEnd === -1 ? content.length : closeEnd + 1
}

const OPEN_COUNTS = new WeakMap<OpenTag[], Map<string, number>>()

function openCounts(openTags: OpenTag[]): Map<string, number> {
  const known = OPEN_COUNTS.get(openTags)
  if (known !== undefined) {
    return known
  }
  const created = new Map<string, number>()
  OPEN_COUNTS.set(openTags, created)
  return created
}

function pushOpen(openTags: OpenTag[], open: OpenTag): void {
  const counts = openCounts(openTags)
  counts.set(open.name, (counts.get(open.name) ?? 0) + 1)
  openTags.push(open)
}

// Closes every open tag from the top of the stack down to stackIndex; unemitted ones write nothing.
function closeFrom(html: string[], openTags: OpenTag[], stackIndex: number): void {
  const counts = openCounts(openTags)
  for (let index = openTags.length - 1; index >= stackIndex; index--) {
    const open = openTags[index]
    if (open !== undefined) {
      counts.set(open.name, (counts.get(open.name) ?? 1) - 1)
    }
    if (open?.emitted === true) {
      html.push(`</${open.name}>`)
    }
  }
  openTags.length = stackIndex
}

function closeTag(html: string[], openTags: OpenTag[], name: string): void {
  // The count check keeps a flood of unmatched closing tags from rescanning the whole stack each time.
  if ((openCounts(openTags).get(name) ?? 0) === 0) {
    return
  }
  const matchingIndex = openTags.findLastIndex((open) => open.name === name)
  if (matchingIndex !== -1) {
    closeFrom(html, openTags, matchingIndex)
  }
}

// A dropped span or link still goes on the stack unemitted, so its closing tag cannot close an outer one.
function appendOpenTag(
  html: string[],
  openTags: OpenTag[],
  name: string,
  attributes: string,
): void {
  if (name === 'br') {
    html.push('<br>')
  } else if (ALLOWED_TAGS.has(name)) {
    html.push(`<${name}>`)
    pushOpen(openTags, { name, emitted: true })
  } else if (name === 'a') {
    const href = htmlDecode(getAttribute(attributes, 'href') ?? '').trim()
    const isWebLink = /^https?:\/\//i.test(href)
    if (isWebLink) {
      html.push(`<a href="${escapeHtml(href)}">`)
    }
    pushOpen(openTags, { name: 'a', emitted: isWebLink })
  } else if (name === 'span') {
    const isMention = itemTypeContains(attributes, 'schema.skype.com/Mention')
    if (isMention) {
      html.push('<span class="mention">')
    }
    pushOpen(openTags, { name: 'span', emitted: isMention })
  } else if (name === 'img') {
    appendImage(html, attributes)
  }
}

function appendImage(html: string[], attributes: string): void {
  const url = amsImageUrl(attributes)
  if (isEmoji(attributes)) {
    html.push(escapeHtml(htmlDecode(getAttribute(attributes, 'alt') ?? '')))
  } else if (url !== null) {
    html.push(`<img class="ams" data-src="${escapeHtml(url)}" alt="image">`)
  } else {
    html.push('[image]')
  }
}

export function safeHtml(content: string, isPlainText: boolean): string {
  if (isPlainText) {
    return escapeHtml(content)
  }
  const html: string[] = []
  const openTags: OpenTag[] = []
  const lower = content.toLowerCase()
  let cursor = 0
  for (const tag of tokenizeTags(content)) {
    if (tag.index < cursor) {
      continue
    }
    html.push(escapeHtml(htmlDecode(content.slice(cursor, tag.index))))
    cursor = tag.index + tag.length
    const { name, attributes } = tag
    if (tag.isClosing) {
      closeTag(html, openTags, name)
    } else if (DROPPED_WITH_CONTENT_TAGS.has(name)) {
      if (!attributes.trimEnd().endsWith('/')) {
        cursor = indexAfterClosingTag(content, lower, cursor, name)
      }
    } else {
      appendOpenTag(html, openTags, name, attributes)
    }
  }
  if (cursor < content.length) {
    html.push(escapeHtml(htmlDecode(content.slice(cursor))))
  }
  closeFrom(html, openTags, 0)
  return html.join('')
}

function plainTextOfTag(tag: TagToken): string {
  const { name, isClosing, attributes } = tag
  if (name === 'br' || (isClosing && (name === 'p' || name === 'div' || name === 'li'))) {
    return '\n'
  }
  if (name === 'img' && !isClosing) {
    return isEmoji(attributes) ? (getAttribute(attributes, 'alt') ?? '') : '[image]'
  }
  return ''
}

// Strips spaces and tabs before each newline; a regex over a long space run would be quadratic.
function trimLineEnds(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      let end = line.length
      while (end > 0 && (line[end - 1] === ' ' || line[end - 1] === '\t')) {
        end--
      }
      return line.slice(0, end)
    })
    .join('\n')
}

/** For a Claude prompt, not for display, so it only needs to read well. */
export function toPlainText(content: string, isPlainText: boolean): string {
  if (isPlainText) {
    return content.trim()
  }
  let stripped = ''
  let cursor = 0
  for (const tag of tokenizeTags(content)) {
    stripped += content.slice(cursor, tag.index) + plainTextOfTag(tag)
    cursor = tag.index + tag.length
  }
  stripped += content.slice(cursor)
  return trimLineEnds(htmlDecode(stripped)).replace(BLANK_LINE_RUN, '\n\n').trim()
}
