import {
  paragraphsFromText,
  shortName,
  type TeamsDraft,
  type TeamsMention,
  type TeamsMessage,
  type TeamsPerson,
} from '@workday/core'
import DOMPurify from 'dompurify'

export const MAX_SUGGESTIONS = 8
const MENTION_ATTRIBUTE = 'data-mention'
const MENTION_TRIGGER = /(^|\s)@([^\s@]*)$/

export interface LoadedDraft {
  readonly html: string
  readonly mentions: readonly TeamsMention[]
}

export interface MentionTrigger {
  readonly node: Text
  readonly start: number
  readonly end: number
  readonly query: string
}

// Lower case without accents, so "dinh" finds "Đinh".
export function plainText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replaceAll('đ', 'd')
}

export function matchPeople(people: readonly TeamsPerson[], query: string): readonly TeamsPerson[] {
  const wanted = plainText(query)
  return people
    .filter((person) => plainText(shortName(person.displayName)).includes(wanted))
    .slice(0, MAX_SUGGESTIONS)
}

export function isWebUrl(url: string): boolean {
  if (!/^https?:\/\/\S+$/i.test(url)) {
    return false
  }
  return URL.canParse(url)
}

// The selection when it sits inside the editor.
export function currentRange(editor: HTMLElement): Range | null {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0) {
    return null
  }
  const range = selection.getRangeAt(0)
  return editor.contains(range.commonAncestorContainer) ? range : null
}

function placeCaretAfter(node: Node): void {
  const range = document.createRange()
  range.setStartAfter(node)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

// A pasted text goes in as text nodes and line breaks only, never as HTML.
export function insertPlainText(editor: HTMLElement, text: string): void {
  const range = currentRange(editor) ?? document.createRange()
  if (!editor.contains(range.commonAncestorContainer)) {
    range.selectNodeContents(editor)
    range.collapse(false)
  }
  range.deleteContents()
  const fragment = document.createDocumentFragment()
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((line, index) => {
      if (index !== 0) {
        fragment.append(document.createElement('br'))
      }
      if (line !== '') {
        fragment.append(document.createTextNode(line))
      }
    })
  const last = fragment.lastChild
  range.insertNode(fragment)
  if (last !== null) {
    placeCaretAfter(last)
  }
}

// An "@" at the start of a word right before the caret, with what was typed after it.
export function mentionTrigger(editor: HTMLElement): MentionTrigger | null {
  const range = currentRange(editor)
  if (range === null || !range.collapsed || !(range.startContainer instanceof Text)) {
    return null
  }
  const node = range.startContainer
  const end = range.startOffset
  const match = MENTION_TRIGGER.exec(node.data.slice(0, end))
  if (match === null) {
    return null
  }
  const query = match[2] ?? ''
  return { node, start: end - query.length - 1, end, query }
}

export function makeChip(index: number, text: string): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.setAttribute(MENTION_ATTRIBUTE, String(index))
  chip.setAttribute('contenteditable', 'false')
  chip.className = 'teams-mention'
  chip.textContent = text
  return chip
}

// Swaps the typed "@query" for the chip and leaves the caret after a space.
export function insertChip(trigger: MentionTrigger, chip: HTMLElement): void {
  const range = document.createRange()
  range.setStart(trigger.node, trigger.start)
  range.setEnd(trigger.node, trigger.end)
  range.deleteContents()
  range.insertNode(chip)
  const space = document.createTextNode(' ')
  chip.after(space)
  placeCaretAfter(space)
}

// The chip right before a collapsed caret, so Backspace can remove it whole.
export function chipBefore(editor: HTMLElement): HTMLElement | null {
  const range = currentRange(editor)
  if (range === null || !range.collapsed) {
    return null
  }
  const { startContainer: container, startOffset: offset } = range
  let previous: Node | null = null
  if (container instanceof Text) {
    previous = offset === 0 ? container.previousSibling : null
  } else if (offset !== 0) {
    previous = container.childNodes[offset - 1] ?? null
  }
  return previous instanceof HTMLElement && previous.hasAttribute(MENTION_ATTRIBUTE)
    ? previous
    : null
}

// The editor's HTML with the chips renumbered 0..n-1 in document order, plus the mentions they point at.
export function draftFromEditor(editor: HTMLElement, known: readonly TeamsMention[]): TeamsDraft {
  const clone = editor.cloneNode(true) as HTMLElement
  const mentions: TeamsMention[] = []
  for (const chip of clone.querySelectorAll(`span[${MENTION_ATTRIBUTE}]`)) {
    const mention = known[Number(chip.getAttribute(MENTION_ATTRIBUTE))]
    if (mention === undefined) {
      chip.replaceWith(document.createTextNode(chip.textContent))
    } else {
      chip.setAttribute(MENTION_ATTRIBUTE, String(mentions.length))
      chip.removeAttribute('contenteditable')
      mentions.push(mention)
    }
  }
  return { html: clone.innerHTML, mentions }
}

// Sanitized HTML into the editor; the chips become non-editable again.
export function setEditorHtml(editor: HTMLElement, html: string): void {
  editor.innerHTML = DOMPurify.sanitize(html)
  for (const chip of editor.querySelectorAll(`span[${MENTION_ATTRIBUTE}]`)) {
    chip.setAttribute('contenteditable', 'false')
  }
}

// A sent message back into composer HTML: Teams mention spans become chips with their mri.
export function loadMessage(message: TeamsMessage): LoadedDraft {
  if (message.isPlainText) {
    return { html: DOMPurify.sanitize(paragraphsFromText(message.content)), mentions: [] }
  }
  const parsed = new DOMParser().parseFromString(message.content, 'text/html')
  const mentions: TeamsMention[] = []
  for (const span of parsed.body.querySelectorAll('span[itemid]')) {
    const mri = message.mentionMris[span.getAttribute('itemid') ?? '']
    if (mri === undefined) {
      continue
    }
    const text = span.textContent
    mentions.push({ text, mri, displayName: text.replace(/^@/, '').trim() })
    for (const name of span.getAttributeNames()) {
      span.removeAttribute(name)
    }
    span.setAttribute(MENTION_ATTRIBUTE, String(mentions.length - 1))
  }
  return { html: DOMPurify.sanitize(parsed.body.innerHTML), mentions }
}

// execCommand is deprecated but is the only way to format a contentEditable.
/* eslint-disable @typescript-eslint/no-deprecated */
export type FormatCommand =
  'bold' | 'italic' | 'underline' | 'strikeThrough' | 'insertUnorderedList' | 'blockquote'

export function applyFormat(command: FormatCommand): void {
  if (typeof document.execCommand !== 'function') {
    return
  }
  if (command === 'blockquote') {
    document.execCommand('formatBlock', false, 'blockquote')
  } else {
    document.execCommand(command)
  }
}

// A collapsed caret gets the URL as its own link text; a selection is wrapped.
export function applyLink(range: Range, url: string): void {
  if (range.collapsed) {
    const link = document.createElement('a')
    link.href = url
    link.textContent = url
    range.insertNode(link)
    placeCaretAfter(link)
  } else if (typeof document.execCommand === 'function') {
    document.execCommand('createLink', false, url)
  }
}
