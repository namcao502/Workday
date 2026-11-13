// The ticket's Teams post: "<KEY> <summary>", a description, then "[label]" blocks of "<branch>: <url>".
import type { TicketPr } from './prTracking.js'
import { repoLabel } from './prTracking.js'
import type { TeamsPerson } from './teamsCompose.js'

const NEW_LINE = '\n'
const LEAD_PLACEHOLDER = '{lead}'
const DA_WORD = 'd\u1ea1'

/** "[BE]" / "[FE Portal]": the configured label of the PR's repository. */
export function sectionHeader(pr: TicketPr, repoLabels: Readonly<Record<string, string>>): string {
  return `[${repoLabel(pr.pr.repository, repoLabels)}]`
}

/** Title, a blank line, the (empty) description line, then a block per repository; prs come ordered by latestPrs. */
export function buildPostDraft(
  ticket: { readonly key: string; readonly summary: string },
  prs: readonly TicketPr[],
  repoLabels: Readonly<Record<string, string>>,
): string {
  const summary = ticket.summary.trim()
  let draft = (summary === '' ? ticket.key : `${ticket.key} ${summary}`) + NEW_LINE + NEW_LINE
  const groups = new Map<string, TicketPr[]>()
  for (const pr of prs.filter((tp) => tp.pr.status !== 'abandoned')) {
    groups.set(pr.pr.repository, [...(groups.get(pr.pr.repository) ?? []), pr])
  }
  for (const group of groups.values()) {
    const first = group[0]
    if (first !== undefined) {
      draft += NEW_LINE + NEW_LINE + sectionHeader(first, repoLabels)
      for (const pr of group) {
        draft += `${NEW_LINE}${pr.branch}: ${pr.pr.url}`
      }
    }
  }
  return draft
}

/** The first line goes in the channel post's Subject (plain text); the rest is the message. */
export function splitSubject(draft: string): { readonly subject: string; readonly body: string } {
  const text = draft.trim().replace(/\r\n?/g, NEW_LINE)
  const split = text.indexOf(NEW_LINE)
  if (split === -1) {
    return { subject: text.trim(), body: '' }
  }
  return { subject: text.slice(0, split).trim(), body: text.slice(split + 1).trim() }
}

/** The lead among the known people: the first whose name starts with the configured name, case-insensitive. */
export function resolvePostLead(
  known: readonly TeamsPerson[],
  leadName: string | null,
): TeamsPerson | null {
  const name = leadName?.trim().toLowerCase() ?? ''
  if (name === '') {
    return null
  }
  return known.find((person) => person.displayName.toLowerCase().startsWith(name)) ?? null
}

// A PR block ("[BE]") or a code fence: the greeting goes on a line of its own before it.
function isBlockStart(line: string): boolean {
  const trimmed = line.trimStart()
  return trimmed.startsWith('[') || trimmed.startsWith('```')
}

function findFrom(lines: readonly string[], from: number, test: (line: string) => boolean): number {
  for (let index = from; index < lines.length; index++) {
    if (test(lines[index] ?? '')) {
      return index
    }
  }
  return -1
}

function isLowerLetter(char: string): boolean {
  return char === char.toLowerCase() && char !== char.toUpperCase()
}

// Without a lead the template keeps what follows the placeholder ("a {lead}, da " -> "da ").
function greetingText(greeting: string, lead: TeamsPerson | null): string {
  if (lead !== null) {
    return greeting.replaceAll(LEAD_PLACEHOLDER, lead.displayName)
  }
  const at = greeting.lastIndexOf(LEAD_PLACEHOLDER)
  return at === -1 ? greeting : greeting.slice(at + LEAD_PLACEHOLDER.length).replace(/^[\s,]+/, '')
}

/** Starts the description with the greeting template; a description that already greets, or no template, leaves the body alone. */
export function withGreeting(
  body: string,
  lead: TeamsPerson | null,
  greeting: string | null,
): string {
  if (greeting === null) {
    return body
  }
  const lineBreak = body.includes('\r\n') ? '\r\n' : '\n'
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const prefix = greetingText(greeting, lead)

  const descriptionIndex = findFrom(lines, 1, (line) => line.trim() !== '')
  const descriptionLine = lines[descriptionIndex] ?? ''
  if (descriptionIndex >= 0 && !isBlockStart(descriptionLine)) {
    const description = descriptionLine.trimStart()
    const firstWord = description.split(/[ \t,]+/).find((word) => word !== '') ?? ''
    if (firstWord.toLowerCase() === 'a' || firstWord.toLowerCase() === DA_WORD) {
      return body
    }
    const second = firstWord.charAt(1)
    const lowersFirst = firstWord.length === 1 || (second !== '' && isLowerLetter(second))
    lines[descriptionIndex] =
      prefix +
      (lowersFirst ? description.charAt(0).toLowerCase() + description.slice(1) : description)
    return lines.join(lineBreak)
  }

  const greetingLine = `${prefix}e update `
  const blockIndex = findFrom(lines, 1, isBlockStart)
  if (blockIndex >= 0) {
    lines.splice(blockIndex, 0, greetingLine, '')
  } else {
    while (lines.length > 1 && (lines[lines.length - 1] ?? '').trim() === '') {
      lines.pop()
    }
    lines.push('', greetingLine)
  }
  return lines.join(lineBreak)
}

/** The key the post is remembered under once posted. */
export function postedKey(ticketKey: string): string {
  return ticketKey
}
