import {
  repoLabel,
  targetSuffix,
  type DevDeploy,
  type PrChange,
  type PrReviewRequest,
} from '@workday/core'
import type { NoticeInput } from '../notices/noticeService.js'

const BOARD_PLACE = 'board'

export function commentsPlace(key: string): string {
  return `pr-comments:${key}`
}

// One notice per state an open PR just entered; e.g. "FE Portal dev" or "BE main -> MDP-7531".
export function changeNotices(
  key: string,
  change: PrChange,
  repoLabels: Readonly<Record<string, string>>,
): readonly NoticeInput[] {
  const { pr } = change
  const branch = `${repoLabel(pr.repository, repoLabels)} ${pr.branch}${targetSuffix(pr.targetBranch)}`
  const onBoard = { kind: 'board', key } as const
  const atUrl = { kind: 'url', url: pr.url } as const
  const notices: NoticeInput[] = []
  if (change.merged) {
    notices.push({
      topic: 'pr',
      tone: 'success',
      event: { type: 'prMerged', key, branch },
      target: onBoard,
      place: BOARD_PLACE,
    })
  }
  if (change.newComments !== 0) {
    notices.push({
      topic: 'pr',
      tone: 'info',
      event: { type: 'prComments', key, branch, count: change.newComments },
      target: atUrl,
      place: commentsPlace(key),
    })
  }
  if (change.buildFailed) {
    notices.push({
      topic: 'pr',
      tone: 'error',
      event: { type: 'prBuildFailed', key, branch },
      target: atUrl,
      place: BOARD_PLACE,
    })
  }
  if (change.conflicted) {
    notices.push({
      topic: 'pr',
      tone: 'error',
      event: { type: 'prConflicted', key, branch },
      target: onBoard,
      place: BOARD_PLACE,
    })
  }
  if (change.newVote !== null) {
    notices.push({
      topic: 'pr',
      tone: change.newVote === 'approved' ? 'success' : 'error',
      event: { type: 'prVote', key, branch, vote: change.newVote },
      target: atUrl,
      place: BOARD_PLACE,
    })
  }
  return notices
}

export function devMergedNotice(key: string): NoticeInput {
  return {
    topic: 'jira',
    tone: 'info',
    event: { type: 'devMerged', key },
    target: { kind: 'board', key },
    place: BOARD_PLACE,
  }
}

export function reviewNotice(request: PrReviewRequest): NoticeInput {
  return {
    topic: 'pr',
    tone: 'info',
    event: { type: 'prReviewRequested', author: request.authorName, title: request.title },
    target: { kind: 'url', url: request.url },
    place: BOARD_PLACE,
  }
}

// moved: the walk already reached Ready to Test, so the notice says so instead of asking.
export function deployNotice(key: string, deploy: DevDeploy, moved: boolean): NoticeInput {
  if (deploy.state === 'deployed') {
    return {
      topic: 'jira',
      tone: 'success',
      event: { type: 'deployed', key, moved },
      target: { kind: 'board', key },
      place: BOARD_PLACE,
    }
  }
  const build = deploy.failedBuild
  return {
    topic: 'jira',
    tone: 'error',
    event: { type: 'deployFailed', key, pipeline: build?.pipelineName ?? '?' },
    target: build === null ? null : { kind: 'url', url: build.url },
    place: BOARD_PLACE,
  }
}
