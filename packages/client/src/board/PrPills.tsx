import { Button, Popover } from '@heroui/react'
import { repoLabel, type TicketPr } from '@workday/core'
import { t } from '../i18n.js'
import type { TodoTone } from './todoText.js'

interface PrState {
  readonly word: string
  readonly tone: TodoTone
  readonly mark: string
}

const MARK_BLOCKER = '✕'
const MARK_DOT = '●'
const MARK_MERGED = '✓'

// An open PR's worst blocker or vote first (TaskRow.PrStateText); else the plain status.
function prState(pr: TicketPr['pr']): PrState {
  if (pr.status === 'completed') {
    return { word: t('Merged', 'Đã merge'), tone: 'success', mark: MARK_MERGED }
  }
  if (pr.status === 'abandoned') {
    return { word: t('Abandoned', 'Đã hủy'), tone: 'muted', mark: MARK_BLOCKER }
  }
  if (pr.build === 'failed') {
    return { word: t('Build failed', 'Build lỗi'), tone: 'danger', mark: MARK_BLOCKER }
  }
  if (pr.merge === 'conflicts') {
    return { word: t('Conflict', 'Conflict'), tone: 'danger', mark: MARK_BLOCKER }
  }
  if (pr.vote === 'rejected') {
    return { word: t('Rejected', 'Bị từ chối'), tone: 'danger', mark: MARK_BLOCKER }
  }
  if (pr.vote === 'waitingForAuthor') {
    return { word: t('Needs work', 'Cần sửa'), tone: 'warning', mark: MARK_DOT }
  }
  if (pr.vote === 'approved') {
    return { word: t('Approved', 'Đã duyệt'), tone: 'accent', mark: MARK_DOT }
  }
  return { word: t('Waiting', 'Chờ merge'), tone: 'muted', mark: MARK_DOT }
}

interface PrPillsProps {
  readonly prs: readonly TicketPr[]
  readonly repoLabels: Readonly<Record<string, string>>
}

// The worst state first: a blocker, then work to do, then waiting, then approved, and merged last.
const TONE_RANK: readonly TodoTone[] = ['danger', 'warning', 'orange', 'muted', 'accent', 'success']
const DOT_CLASS: Readonly<Record<TodoTone, string>> = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  orange: 'bg-warning',
  muted: 'bg-muted',
  accent: 'bg-accent',
  success: 'bg-success',
  ready: 'bg-success',
}

function worstTone(prs: readonly TicketPr[]): TodoTone {
  const tones = prs.map((ticketPr) => prState(ticketPr.pr).tone)
  return TONE_RANK.find((tone) => tones.includes(tone)) ?? 'muted'
}

// One button for all of a ticket's PRs: its dot is the worst state; a click lists each PR (repo, branch, state)
// with a link that opens it in a new tab.
export function PrPills({ prs, repoLabels }: PrPillsProps): React.JSX.Element | null {
  if (prs.length === 0) {
    return null
  }
  return (
    <Popover>
      <Button size="sm" variant="secondary" className="ml-2 align-middle">
        {`PR ${String(prs.length)}`}
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${DOT_CLASS[worstTone(prs)]}`}
          data-testid="pr-dot"
        />
      </Button>
      <Popover.Content placement="bottom start">
        <Popover.Dialog className="w-72 max-w-[92vw]">
          <Popover.Heading className="pb-2 font-semibold">
            {t('Pull requests', 'Pull request')}
          </Popover.Heading>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {prs.map((ticketPr) => {
              const state = prState(ticketPr.pr)
              const repo = repoLabel(ticketPr.pr.repository, repoLabels)
              return (
                <li key={ticketPr.key}>
                  <a
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm no-underline hover:bg-surface-secondary"
                    href={ticketPr.pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`${repo} ${ticketPr.branch} #${String(ticketPr.pullRequestId)}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`size-2 shrink-0 rounded-full ${DOT_CLASS[state.tone]}`}
                    />
                    <span className="min-w-0 flex-1 truncate">{`${repo} ${ticketPr.branch}`}</span>
                    <span className="shrink-0 text-muted">{`${state.mark} ${state.word}`}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}
