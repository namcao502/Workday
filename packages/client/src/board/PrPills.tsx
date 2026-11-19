import { Comment } from '@gravity-ui/icons'
import { Button, Popover } from '@heroui/react'
import { repoLabel, type TicketPr } from '@workday/core'
import { t } from '../i18n.js'
import type { TodoTone } from './todoText.js'
import { Tip } from '../ui/Tip.js'

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

// Unresolved review threads; a merged or abandoned PR's leftovers wait on nobody.
function openComments(pr: TicketPr['pr']): number {
  return pr.status === 'active' ? (pr.openThreadCount ?? 0) : 0
}

function openCommentsText(count: number): string {
  return t(
    `${String(count)} open comment${count === 1 ? '' : 's'}`,
    `${String(count)} comment chưa xử lý`,
  )
}

interface PrPillsProps {
  readonly prs: readonly TicketPr[]
  readonly repoLabels: Readonly<Record<string, string>>
  readonly className?: string // the gap after the text it follows; none in a column of its own
  readonly showState?: boolean // under a PR column header: the worst state in words, the count on hover
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

// The state behind the button's dot, so its color has words too.
function worstState(prs: readonly TicketPr[]): PrState | undefined {
  const states = prs.map((ticketPr) => prState(ticketPr.pr))
  const tone = TONE_RANK.find((candidate) => states.some((state) => state.tone === candidate))
  return states.find((state) => state.tone === tone)
}

// One button for all of a ticket's PRs: its dot is the worst state; a click lists each PR (repo, branch, state)
// with a link that opens it in a new tab.
export function PrPills({
  prs,
  repoLabels,
  className = 'ml-2',
  showState = false,
}: PrPillsProps): React.JSX.Element | null {
  if (prs.length === 0) {
    return null
  }
  const worst = worstState(prs)
  const label = `PR ${String(prs.length)}`
  const comments = prs.reduce((total, ticketPr) => total + openComments(ticketPr.pr), 0)
  const stateLabel = worst === undefined ? label : `${label}: ${worst.word}`
  const dot = (
    <span
      aria-hidden="true"
      className={`size-2 rounded-full ${DOT_CLASS[worst?.tone ?? 'muted']}`}
      data-testid="pr-dot"
    />
  )
  return (
    <Popover>
      <Button
        size="sm"
        variant="secondary"
        className={`${className} align-middle`.trim()}
        aria-label={comments === 0 ? stateLabel : `${stateLabel}, ${openCommentsText(comments)}`}
      >
        {showState ? (
          <Tip className="flex items-center gap-1.5" content={label}>
            {dot}
            {worst?.word}
          </Tip>
        ) : (
          <Tip className="flex items-center gap-1.5" content={worst?.word}>
            {label}
            {dot}
          </Tip>
        )}
        {comments === 0 ? null : (
          <Tip
            className="flex items-center gap-1 text-warning"
            content={openCommentsText(comments)}
          >
            <Comment aria-hidden="true" />
            {comments}
          </Tip>
        )}
      </Button>
      <Popover.Content placement="bottom start">
        <Popover.Dialog className="w-80 max-w-[92vw]">
          <Popover.Heading className="pb-2 font-semibold">
            {t('Pull requests', 'Pull request')}
          </Popover.Heading>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {prs.map((ticketPr) => {
              const state = prState(ticketPr.pr)
              const repo = repoLabel(ticketPr.pr.repository, repoLabels)
              return (
                <li key={ticketPr.key}>
                  <Tip
                    className="block"
                    content={`${repo} ${ticketPr.branch} #${String(ticketPr.pullRequestId)}`}
                  >
                    <a
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm no-underline hover:bg-surface-secondary"
                      href={ticketPr.pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span
                        aria-hidden="true"
                        className={`size-2 shrink-0 rounded-full ${DOT_CLASS[state.tone]}`}
                      />
                      <span className="min-w-0 flex-1 truncate">{`${repo} ${ticketPr.branch}`}</span>
                      <span className="shrink-0 text-muted">{`${state.mark} ${state.word}`}</span>
                      {openComments(ticketPr.pr) === 0 ? null : (
                        <span className="shrink-0 text-warning">
                          {openCommentsText(openComments(ticketPr.pr))}
                        </span>
                      )}
                    </a>
                  </Tip>
                </li>
              )
            })}
          </ul>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}
