// Pure parts of answering QC about a fixed bug: the draft, the reply built from it, who to tag, whether it was answered.
import { escapeHtml, toPlainText } from './teamsHtml.js'
import type { TeamsMessage, TeamsThread } from './teamsChat.js'
import { shortName, type TeamsMention, type TeamsPerson } from './teamsCompose.js'
import { splitSubject } from './teamsPost.js'

export interface BugFixPr {
  readonly block: string
  readonly branch: string
  readonly url: string
}

export interface BugFix {
  readonly bugKey: string
  readonly parentKey: string
  readonly summary: string
  readonly description: string
  readonly pullRequests: readonly BugFixPr[]
  readonly draftWrittenAt: string // ISO
}

const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
const PERSON_SENDER_PREFIX = '8:orgid:'
const BLOCK_HEADER = /^\[([^\]]+)\]\s*$/
const PR_LINE = /^([^:]+):\s*(https?:\/\/\S+)\s*$/
const CODE_SPAN = /`([^`]+)`/g
const BOLD_SPAN = /\*\*(\S(?:.*?\S)?)\*\*/g
const ITALIC_SPAN = /\*([^\s*](?:[^*]*?[^\s*])?)\*/g

// Title line, then the description up to the first "[block]", then "<branch>: <url>" lines under each block.
export function parseBugFix(
  parentKey: string,
  bugKey: string,
  draft: string,
  writtenAt: string,
): BugFix {
  const { subject, body } = splitSubject(draft)
  const description: string[] = []
  const pullRequests: BugFixPr[] = []
  let block: string | null = null
  for (const line of body.split('\n').map((text) => text.trim())) {
    const header = BLOCK_HEADER.exec(line)
    if (header !== null) {
      block = (header[1] ?? '').trim()
    } else if (block === null) {
      if (line !== '') {
        description.push(line)
      }
    } else {
      const pr = PR_LINE.exec(line)
      if (pr !== null) {
        pullRequests.push({ block, branch: (pr[1] ?? '').trim(), url: pr[2] ?? '' })
      }
    }
  }
  return {
    bugKey,
    parentKey,
    summary: subject,
    description: description.join('\n'),
    pullRequests,
    draftWrittenAt: writtenAt,
  }
}

// An old draft, or one of a bug QC already closed, needs no reply any more.
export function isFixCurrent(fix: BugFix, bugStatusCategory: string | null, now: Date): boolean {
  return (
    now.getTime() - Date.parse(fix.draftWrittenAt) <= DRAFT_MAX_AGE_MS &&
    bugStatusCategory?.toLowerCase() !== 'done'
  )
}

function isMine(message: TeamsMessage, myId: string): boolean {
  return message.senderId.toLowerCase() === myId.toLowerCase()
}

function othersNewestFirst(thread: TeamsThread, myId: string): readonly TeamsMessage[] {
  return thread.messages
    .filter((message) => !isMine(message, myId) && message.senderId.startsWith(PERSON_SENDER_PREFIX))
    .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))
}

// The QC who spoke last in the thread, else whoever else spoke last: the Jira reporter's name rarely matches Teams.
export function qcToTag(thread: TeamsThread, myId: string): TeamsPerson | null {
  const others = othersNewestFirst(thread, myId)
  const sender = others.find((message) => message.senderName.includes('QC')) ?? others[0]
  return sender === undefined ? null : { mri: sender.senderId, displayName: sender.senderName }
}

// When another person last spoke in the thread: the conversation QC is talking in is the one to answer in.
export function newestOtherMessageAt(thread: TeamsThread, myId: string): string | null {
  return othersNewestFirst(thread, myId)[0]?.sentAt ?? null
}

export function isFixReplied(thread: TeamsThread, myId: string, fix: BugFix): boolean {
  const key = fix.bugKey.toLowerCase()
  return thread.messages.some(
    (message) =>
      isMine(message, myId) &&
      Date.parse(message.sentAt) > Date.parse(fix.draftWrittenAt) &&
      toPlainText(message.content, message.isPlainText).toLowerCase().includes(key),
  )
}

// The draft is markdown: its bold, italic and code spans, on already escaped text.
function inlineMarkdown(escapedLine: string): string {
  return escapedLine
    .replace(CODE_SPAN, '<code>$1</code>')
    .replace(BOLD_SPAN, '<strong>$1</strong>')
    .replace(ITALIC_SPAN, '<em>$1</em>')
}

function blockHtml(block: string, prs: readonly BugFixPr[]): string {
  const lines = prs.map(
    (pr) => `${escapeHtml(pr.branch)}: <a href="${escapeHtml(pr.url)}">${escapeHtml(pr.url)}</a>`,
  )
  return `<p>[${escapeHtml(block)}]<br>${lines.join('<br>')}</p>`
}

// A fix still to answer in a thread: the reply box's HTML and the mentions its chip (data-mention="0") points at.
export interface BugReply {
  readonly fix: BugFix
  readonly replyHtml: string
  readonly mentions: readonly TeamsMention[]
}

// The mention the composer's picker would build for this person.
export function replyMention(qc: TeamsPerson): TeamsMention {
  return { text: `@${shortName(qc.displayName)}`, mri: qc.mri, displayName: qc.displayName }
}

// The reply box's HTML: the QC's chip (the composer's data-mention form), the fix, then its PRs block by block.
export function buildReplyHtml(fix: BugFix, qc: TeamsPerson | null): string {
  const chip =
    qc === null
      ? ''
      : `<span data-mention="0">${escapeHtml(replyMention(qc).text)}</span>, `
  let html = `<p>${chip}dạ e fix bug ${escapeHtml(fix.bugKey)} r nha</p>`
  for (const line of fix.description.split('\n').filter((text) => text !== '')) {
    html += `<p>${inlineMarkdown(escapeHtml(line))}</p>`
  }
  const blocks = new Map<string, BugFixPr[]>()
  for (const pr of fix.pullRequests) {
    blocks.set(pr.block, [...(blocks.get(pr.block) ?? []), pr])
  }
  for (const [block, prs] of blocks) {
    html += blockHtml(block, prs)
  }
  return html
}
