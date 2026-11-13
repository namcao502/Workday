// The ticket's new-post draft: the file Claude wrote, else one built from the board and its PRs.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  buildPostDraft,
  resolvePostLead,
  safeHtml,
  splitSubject,
  withGreeting,
  type BoardState,
  type TeamsConfig,
  type TeamsPerson,
  type TicketPr,
} from '@workday/core'
import { marked } from 'marked'
import { worktreePathOf } from '../workspace/ticketWorktrees.js'

const DRAFT_FILE = 'teams-post.md'

export interface PostDraft {
  readonly subject: string
  readonly body: string
  readonly bodyHtml: string
}

export interface DraftSources {
  readonly devRepoPath: string | null
  readonly summary: string | null
  readonly prs: readonly TicketPr[]
  readonly repoLabels: Readonly<Record<string, string>>
  readonly config: TeamsConfig
  readonly people: readonly TeamsPerson[]
}

// The dev repo's docs first (the docs hook mirrors worktree edits there), then the ticket's worktree.
async function readDraftFile(
  devRepoPath: string | null,
  ticketKey: string,
): Promise<string | null> {
  if (devRepoPath === null) {
    return null
  }
  const roots = [devRepoPath, worktreePathOf(devRepoPath, ticketKey)]
  for (const root of roots) {
    try {
      const text = await readFile(join(root, 'docs', ticketKey, DRAFT_FILE), 'utf8')
      if (text.trim() !== '') {
        return text
      }
    } catch {
      // A missing or unreadable file falls through to the next place.
    }
  }
  return null
}

/** Markdown to HTML, then the same whitelist as a received message: the draft may hold anything. */
export function draftHtml(markdown: string): string {
  return safeHtml(marked.parse(markdown, { async: false }), false)
}

export async function loadPostDraft(ticketKey: string, sources: DraftSources): Promise<PostDraft> {
  const draft =
    (await readDraftFile(sources.devRepoPath, ticketKey)) ??
    buildPostDraft(
      { key: ticketKey, summary: sources.summary ?? '' },
      sources.prs,
      sources.repoLabels,
    )
  const lead = resolvePostLead(sources.people, sources.config.postLeadName)
  const greeted = withGreeting(draft, lead, sources.config.postGreeting)
  const { subject, body } = splitSubject(greeted)
  return { subject, body, bodyHtml: draftHtml(body) }
}

export function ticketSummary(board: BoardState, key: string): string | null {
  const sections = [board.new, board.inProgress, board.done]
  for (const section of sections) {
    if (Object.hasOwn(section, key)) {
      return section[key]?.summary ?? null
    }
  }
  return Object.hasOwn(board.dismissed, key) ? (board.dismissed[key]?.ticket.summary ?? null) : null
}
