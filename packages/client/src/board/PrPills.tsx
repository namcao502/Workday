import { Chip } from '@heroui/react'
import { repoLabel, type TicketPr } from '@workday/core'
import { t } from '../i18n.js'
import { chipColor, type TodoTone } from './todoText.js'

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

// One pill per latest PR (repo + branch); a click opens the PR in a new tab.
export function PrPills({ prs, repoLabels }: PrPillsProps): React.JSX.Element | null {
  if (prs.length === 0) {
    return null
  }
  return (
    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
      {prs.map((ticketPr) => {
        const state = prState(ticketPr.pr)
        const repo = repoLabel(ticketPr.pr.repository, repoLabels)
        return (
          <a
            key={ticketPr.key}
            className="rounded-full no-underline"
            href={ticketPr.pr.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${repo} ${ticketPr.branch} #${String(ticketPr.pullRequestId)}`}
          >
            <Chip size="sm" color={chipColor(state.tone)}>
              {`${repo} ${ticketPr.branch} `}
              <span aria-hidden="true">{state.mark}</span>
              {` ${state.word}`}
            </Chip>
          </a>
        )
      })}
    </span>
  )
}
