import { repoLabel, type DevDeploy, type Ticket, type TicketPr, type TodoItem } from '@workday/core'
import { formatClock, formatDateOnly, t, type Language } from '../i18n.js'

export type TodoTone = 'accent' | 'success' | 'danger' | 'warning' | 'muted' | 'orange' | 'ready'

export type ChipColor = 'accent' | 'success' | 'danger' | 'warning' | 'default'

// The HeroUI Chip color that stands for a tone.
export function chipColor(tone: TodoTone): ChipColor {
  switch (tone) {
    case 'accent':
    case 'success':
    case 'danger':
    case 'warning':
      return tone
    case 'ready':
      return 'success'
    case 'orange':
      return 'warning'
    case 'muted':
      return 'default'
  }
}

export interface TodoTextParts {
  readonly title: string
  readonly detail: string
  readonly tone: TodoTone
}

export interface TodoTextContext {
  readonly ticketOf: (key: string) => Ticket | undefined
  readonly repoLabels: Readonly<Record<string, string>>
  readonly language: Language
  readonly timeZone?: string | undefined // the message time; UTC when unknown
}

// An open PR's blockers and the reviewer's ask, worst first (the words of TodoText.cs, PrBlocked).
export function prProblems(pr: TicketPr['pr']): readonly string[] {
  const problems: string[] = []
  if (pr.build === 'failed') {
    problems.push(t('build failed', 'build lỗi'))
  }
  if (pr.merge === 'conflicts') {
    problems.push(t('conflict', 'conflict'))
  }
  if (pr.vote === 'rejected') {
    problems.push(t('rejected', 'bị từ chối'))
  }
  if (pr.vote === 'waitingForAuthor') {
    problems.push(t('needs work', 'cần sửa'))
  }
  return problems
}

function claudeWaitingText(item: Extract<TodoItem, { kind: 'claudeWaiting' }>): string {
  switch (item.wait) {
    case 'permission':
      return t('Claude needs your permission', 'Claude cần bạn cấp quyền')
    case 'question':
      return t('Claude is asking you something', 'Claude đang hỏi bạn')
    case 'finished':
      return t('Claude is done - your turn', 'Claude đã xong, tới lượt bạn')
  }
}

export function deployTitle(deploy: DevDeploy | null): string {
  switch (deploy?.state) {
    case 'deploying':
      return t('dev PR merged - deploying to dev', 'PR dev đã merge - đang deploy dev')
    case 'deployed':
      return t('on dev now', 'đã lên dev')
    case 'failed': {
      const pipeline = deploy.failedBuild?.pipelineName ?? ''
      return t(`dev deploy failed (${pipeline})`, `deploy dev lỗi (${pipeline})`)
    }
    case undefined:
      return t('dev PR merged', 'PR dev đã merge')
  }
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

export function todoText(item: TodoItem, context: TodoTextContext): TodoTextParts {
  const ticket =
    'ticketKey' in item && item.ticketKey !== null ? context.ticketOf(item.ticketKey) : undefined
  const summary = ticket?.summary ?? ''
  switch (item.kind) {
    case 'claudeWaiting':
      return {
        title: claudeWaitingText(item),
        detail: summary === '' ? t('Open the tab to answer', 'Mở tab để trả lời') : summary,
        tone: 'accent',
      }
    case 'teamsMessage': {
      const sent = formatClock(
        new Date(item.item.sentAt),
        context.language,
        context.timeZone ?? 'UTC',
      )
      return {
        title: `${item.item.title}: ${item.item.senderName}`,
        detail: summary === '' ? sent : `${summary} - ${sent}`,
        tone: item.item.mentionsMe ? 'danger' : 'accent',
      }
    }
    case 'readyToTest':
      return {
        title: deployTitle(item.deploy),
        detail: ticket === undefined ? '' : `${summary} - Jira: ${ticket.status ?? ''}`,
        tone: item.deploy?.state === 'failed' ? 'danger' : 'ready',
      }
    case 'prReview': {
      const { review } = item
      const repo = repoLabel(review.repository, context.repoLabels)
      const required = review.isRequired ? t(' - required', ' - bắt buộc') : ''
      return {
        title: `Review: ${review.title}`,
        detail: `${review.authorName} - ${repo} #${String(review.pullRequestId)}${required}`,
        tone: 'accent',
      }
    }
    case 'prBlocked': {
      const { pr } = item
      const repo = repoLabel(pr.pr.repository, context.repoLabels)
      const onlyWaiting =
        pr.pr.build !== 'failed' && pr.pr.merge !== 'conflicts' && pr.pr.vote === 'waitingForAuthor'
      return {
        title: `${repo} ${pr.branch} PR: ${prProblems(pr.pr).join(' - ')}`,
        detail: summary,
        tone: onlyWaiting ? 'warning' : 'danger',
      }
    }
    case 'prComments':
      return {
        title: t(
          `${String(item.count)} new PR ${plural(item.count, 'comment', 'comments')}`,
          `${String(item.count)} comment PR mới`,
        ),
        detail: summary,
        tone: 'accent',
      }
    case 'jiraDone':
      return { title: `Jira: ${ticket?.status ?? ''}`, detail: summary, tone: 'orange' }
    case 'overdue': {
      const due =
        ticket?.dueDate === null || ticket === undefined
          ? ''
          : formatDateOnly(ticket.dueDate, context.language)
      return {
        title: t(`overdue since ${due}`, `quá hạn từ ${due}`),
        detail: summary,
        tone: 'danger',
      }
    }
  }
}
