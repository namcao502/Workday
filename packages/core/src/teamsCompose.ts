// Builds a Teams message body from browser HTML, which is untrusted: only whitelisted output is written.
import type { TeamsMessage, TeamsThread } from './teamsChat.js'
import { escapeHtml, htmlDecode, indexAfterClosingTag } from './teamsHtml.js'
import { getAttribute, tokenizeTags } from './teamsTags.js'

export interface TeamsMention {
  readonly text: string
  readonly mri: string
  readonly displayName: string
}

/** html carries `<span data-mention="i">` markers that point into mentions. */
export interface TeamsDraft {
  readonly html: string
  readonly mentions: readonly TeamsMention[]
}

export interface TeamsMessageBody {
  readonly html: string
  readonly mentionsJson: string | null
}

export interface TeamsPerson {
  readonly mri: string
  readonly displayName: string
}

const MENTION_ITEM_TYPE = 'http://schema.skype.com/Mention'
const PERSON_MRI = /^8:orgid:[0-9a-f-]{36}$/
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g
const DIGITS = /^[0-9]+$/

const KEPT_TAGS: ReadonlySet<string> = new Set([
  'p',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
])
// Everything buildBody turns into something Teams keeps; a message with any other tag is not editable here.
const EDITABLE_TAGS: ReadonlySet<string> = new Set([...KEPT_TAGS, 'div', 'br', 'a'])
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

export function isPersonMri(mri: string): boolean {
  return PERSON_MRI.test(mri)
}

/** "Minh Dinh (Monster Digital)" -> "Minh Dinh"; a name that is only a parenthesis stays whole. */
export function shortName(displayName: string): string {
  const trimmed = displayName.trimEnd()
  const open = trimmed.lastIndexOf('(')
  if (!trimmed.endsWith(')') || open === -1 || trimmed.slice(open + 1, -1).includes(')')) {
    return displayName
  }
  const short = trimmed.slice(0, open).trim()
  return short === '' ? displayName : short
}

function sentTime(message: TeamsMessage): number {
  return Date.parse(message.sentAt)
}

/** Senders in the threads, newest first with their newest name, then the known people not already listed; never me or a bot. */
export function people(
  threads: readonly TeamsThread[],
  known: readonly TeamsPerson[],
  myId: string,
): readonly TeamsPerson[] {
  const messages = threads
    .flatMap((thread) => thread.messages)
    .filter(
      (message) =>
        message.senderName !== '' && isPersonMri(message.senderId) && message.senderId !== myId,
    )
    .sort((a, b) => sentTime(b) - sentTime(a))
  const found = new Map<string, TeamsPerson>()
  for (const message of messages) {
    if (!found.has(message.senderId)) {
      found.set(message.senderId, { mri: message.senderId, displayName: message.senderName })
    }
  }
  for (const person of known) {
    if (!found.has(person.mri) && isPersonMri(person.mri) && person.mri !== myId) {
      found.set(person.mri, person)
    }
  }
  return [...found.values()]
}

function trimUrl(url: string): string {
  const marks = url.includes('(') ? '.,;:!?]' : '.,;:!?)]'
  let end = url.length
  while (end > 0 && marks.includes(url[end - 1] ?? '')) {
    end--
  }
  return url.slice(0, end)
}

// URLs are found on the raw line, so an escaped "&gt;" next to one never ends up inside its href.
function lineToHtml(line: string): string {
  let html = ''
  let position = 0
  for (const match of line.matchAll(URL_PATTERN)) {
    const url = trimUrl(match[0])
    const escaped = escapeHtml(url)
    html += `${escapeHtml(line.slice(position, match.index))}<a href="${escaped}">${escaped}</a>`
    position = match.index + url.length
  }
  return html + escapeHtml(line.slice(position))
}

/** Plain text as HTML: lines joined by `<br>`, URLs made clickable. */
export function toHtml(text: string): string {
  return text.replace(/\r\n?/g, '\n').split('\n').map(lineToHtml).join('<br>')
}

/** One `<p>` per line, links made clickable: plain text as the composer's HTML. */
export function paragraphsFromText(text: string): string {
  return text
    .trim()
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (line === '' ? '<p><br></p>' : `<p>${toHtml(line)}</p>`))
    .join('')
}

function stripTags(html: string): string {
  let text = ''
  let cursor = 0
  for (const tag of tokenizeTags(html)) {
    text += html.slice(cursor, tag.index)
    cursor = tag.index + tag.length
  }
  return text + html.slice(cursor)
}

export function isEmptyHtml(html: string): boolean {
  return htmlDecode(stripTags(html)).trim() === ''
}

/** True when the composer can send this message back without losing anything: no files, only kept tags, only mentions with an mri. */
export function isEditable(message: TeamsMessage): boolean {
  if (message.hasFiles) {
    return false
  }
  if (message.isPlainText) {
    return true
  }
  for (const tag of tokenizeTags(message.content)) {
    if (tag.isClosing) {
      continue
    }
    if (tag.name === 'span') {
      const itemType = (getAttribute(tag.attributes, 'itemtype') ?? '').toLowerCase()
      const itemId = getAttribute(tag.attributes, 'itemid') ?? ''
      const isMention = itemType.includes('schema.skype.com/mention')
      if (!isMention || !Object.hasOwn(message.mentionMris, itemId)) {
        return false
      }
    } else if (!EDITABLE_TAGS.has(tag.name)) {
      return false
    }
  }
  return true
}

// The open tags with a per-name count, so a flood of unmatched closing tags never rescans the stack.
class OpenTags {
  private readonly stack: { readonly name: string; readonly emitted: string | null }[] = []
  private readonly counts = new Map<string, number>()

  has(name: string): boolean {
    return (this.counts.get(name) ?? 0) !== 0
  }

  push(name: string, emitted: string | null): void {
    this.stack.push({ name, emitted })
    this.counts.set(name, (this.counts.get(name) ?? 0) + 1)
  }

  // Closes from the top down to the last open tag called `name`, writing the tags that were emitted.
  close(output: string[], name: string): void {
    if (this.has(name)) {
      this.closeFrom(
        output,
        this.stack.findLastIndex((open) => open.name === name),
      )
    }
  }

  closeFrom(output: string[], index: number): void {
    for (let at = this.stack.length - 1; at >= index; at--) {
      const open = this.stack[at]
      if (open !== undefined) {
        this.counts.set(open.name, (this.counts.get(open.name) ?? 1) - 1)
        if (open.emitted !== null) {
          output.push(`</${open.emitted}>`)
        }
      }
    }
    this.stack.length = index
  }
}

// The composer keeps an empty line after a block to type into; trailing empty paragraphs are not sent.
function withoutTrailingEmptyParagraphs(html: string): string {
  let end = html.length
  while (html.startsWith('</p>', end - 4) && end >= 4) {
    const start = html.lastIndexOf('<p>', end - 4)
    const inner = start === -1 ? 'x' : html.slice(start + 3, end - 4)
    if (inner.replaceAll('<br>', '').replaceAll('&nbsp;', '').trim() !== '') {
      break
    }
    end = start
  }
  return html.slice(0, end)
}

interface MentionResult {
  readonly cursor: number
}

// A valid marker becomes a Teams mention (its text is the span's own); an invalid one keeps only its text.
function appendMentionSpan(
  output: string[],
  open: OpenTags,
  posted: Record<string, string>[],
  html: string,
  lower: string,
  cursor: number,
  attributes: string,
  mentions: readonly TeamsMention[],
): MentionResult {
  const marker = getAttribute(attributes, 'data-mention')
  const mention = marker !== null && DIGITS.test(marker) ? mentions[Number(marker)] : undefined
  if (mention === undefined || !isPersonMri(mention.mri)) {
    open.push('span', null)
    return { cursor }
  }
  const innerEnd = lower.indexOf('</span', cursor)
  const inner = innerEnd === -1 ? html.slice(cursor) : html.slice(cursor, innerEnd)
  const label = htmlDecode(stripTags(inner)).trim()
  const itemId = String(posted.length)
  output.push(
    `<span itemtype="${MENTION_ITEM_TYPE}" itemscope itemid="${itemId}">${escapeHtml(label === '' ? mention.text : label)}</span>`,
  )
  posted.push({
    '@type': MENTION_ITEM_TYPE,
    itemid: itemId,
    mri: mention.mri,
    mentionType: 'person',
    displayName: mention.displayName,
  })
  return {
    cursor: innerEnd === -1 ? html.length : indexAfterClosingTag(html, lower, cursor, 'span'),
  }
}

function appendLink(output: string[], open: OpenTags, attributes: string): void {
  const href = htmlDecode(getAttribute(attributes, 'href') ?? '').trim()
  const isWebLink = /^https?:\/\//i.test(href)
  if (isWebLink) {
    const escaped = escapeHtml(href)
    output.push(`<a href="${escaped}" title="${escaped}">`)
  }
  open.push('a', isWebLink ? 'a' : null)
}

function appendText(output: string[], open: OpenTags, raw: string): void {
  const text = escapeHtml(htmlDecode(raw))
  output.push(open.has('pre') ? text.replaceAll('\u00a0', '&nbsp;') : text)
}

/** The security boundary for a sent message: null when nothing is left after the whitelist. */
export function buildBody(draft: TeamsDraft): TeamsMessageBody | null {
  const { html, mentions } = draft
  const lower = html.toLowerCase()
  const output: string[] = []
  const open = new OpenTags()
  const posted: Record<string, string>[] = []
  let cursor = 0
  for (const tag of tokenizeTags(html)) {
    if (tag.index < cursor) {
      continue
    }
    appendText(output, open, html.slice(cursor, tag.index))
    cursor = tag.index + tag.length
    const { name, attributes } = tag
    if (tag.isClosing) {
      open.close(output, name)
    } else if (DROPPED_WITH_CONTENT_TAGS.has(name)) {
      if (!attributes.trimEnd().endsWith('/')) {
        cursor = indexAfterClosingTag(html, lower, cursor, name)
      }
    } else if (name === 'br') {
      output.push('<br>')
    } else if (name === 'span') {
      cursor = appendMentionSpan(
        output,
        open,
        posted,
        html,
        lower,
        cursor,
        attributes,
        mentions,
      ).cursor
    } else if (name === 'a') {
      appendLink(output, open, attributes)
    } else if (name === 'div') {
      output.push('<p>')
      open.push('div', 'p')
    } else if (KEPT_TAGS.has(name)) {
      output.push(`<${name}>`)
      open.push(name, name)
    }
  }
  if (cursor < html.length) {
    appendText(output, open, html.slice(cursor))
  }
  open.closeFrom(output, 0)
  const body = withoutTrailingEmptyParagraphs(output.join(''))
  if (isEmptyHtml(body)) {
    return null
  }
  return { html: body, mentionsJson: posted.length === 0 ? null : JSON.stringify(posted) }
}
