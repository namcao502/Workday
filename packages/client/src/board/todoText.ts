import {
  noticeText,
  repoLabel,
  type DevDeploy,
  type Ticket,
  type TicketPr,
  type TodoItem,
} from '@workday/core'
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
    problems.push(t('board.buildFailed2'))
  }
  if (pr.merge === 'conflicts') {
    problems.push(t('board.conflict2'))
  }
  if (pr.vote === 'rejected') {
    problems.push(t('board.rejected2'))
  }
  if (pr.vote === 'waitingForAuthor') {
    problems.push(t('board.needsWork2'))
  }
  return problems
}

function claudeWaitingText(item: Extract<TodoItem, { kind: 'claudeWaiting' }>): string {
  switch (item.wait) {
    case 'permission':
      return t('board.claudeNeedsYourPermission')
    case 'question':
      return t('board.claudeIsAskingYouSomething')
    case 'finished':
      return t('board.claudeIsDoneYourTurn')
  }
}

export function deployTitle(deploy: DevDeploy | null): string {
  switch (deploy?.state) {
    case 'deploying':
      return t('board.devPrMergedDeployingToDev')
    case 'deployed':
      return t('board.onDevNow')
    case 'failed': {
      const pipeline = deploy.failedBuild?.pipelineName ?? ''
      return t('board.devDeployFailed', { pipeline })
    }
    case undefined:
      return t('board.devPrMerged')
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
        detail: summary === '' ? t('board.openTheTabToAnswer') : summary,
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
      const required = review.isRequired ? t('board.required') : ''
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
        title: t('board.newPr', {
          count: String(item.count),
          plural: plural(item.count, 'comment', 'comments'),
        }),
        detail: summary,
        tone: 'accent',
      }
    case 'dbReview':
      return {
        title: t('board.dbChangeApprovedByRunThe', {
          ticketKey: item.ticketKey,
          approverName: item.approval.approverName,
        }),
        detail: summary,
        tone: 'warning',
      }
    case 'qcBug':
      return {
        title: t('board.qcBugOn', { ticketKey: item.ticketKey, parentKey: item.parentKey }),
        detail: summary,
        tone: 'danger',
      }
    case 'qcBugReply':
      return {
        title: t('board.isFixedAnswerQcOn', {
          ticketKey: item.ticketKey,
          parentKey: item.parentKey,
        }),
        detail: item.fix.summary,
        tone: 'accent',
      }
    case 'jiraUpdated':
      return {
        title: noticeText(
          {
            type: 'ticketUpdated',
            key: item.ticketKey,
            fields: item.fields,
            changedBy: item.changedBy,
          },
          context.language,
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
        title: t('board.overdueSince', { due }),
        detail: summary,
        tone: 'danger',
      }
    }
  }
}
