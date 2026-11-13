import type {
  DeployBuild,
  PrBuild,
  PrMerge,
  PrRead,
  PrReviewRequest,
  PrStatus,
  PrVote,
} from '@workday/core'
import { isRecord } from '../jsonFile.js'

// The policy type of the "Build" branch policy.
export const BUILD_POLICY_TYPE_ID = '0609b952-1397-4640-95ec-e00a01b2c241'

const HEADS_PREFIX = 'refs/heads/'
const TICKET_IN_BRANCH = /\b[A-Z][A-Z0-9]+-\d+\b/
const VOTE_REJECTED = -10
const VOTE_WAITING = -5
const VOTE_APPROVED = 5

export type CredentialCheck = 'valid' | 'rejected' | 'unreachable'

export interface ListedPr {
  readonly pr: PrRead // branch is '' and the counts are 0 until the caller fills them
  readonly projectId: string | null
}

function objectOrEmpty(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {}
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function listOf(root: unknown): readonly unknown[] {
  const value = objectOrEmpty(root)['value']
  return Array.isArray(value) ? (value as readonly unknown[]) : []
}

// The labels of "<KEY>-<label>" branches from a refs read, "-dev" left out (it is read already), each once.
export function parseExtraBranchLabels(ticketKey: string, refsRoot: unknown): readonly string[] {
  const prefix = `${HEADS_PREFIX}${ticketKey}-`
  const labels: string[] = []
  for (const gitRef of listOf(refsRoot)) {
    const name = textOrNull(objectOrEmpty(gitRef)['name'])
    if (name === null || !name.startsWith(prefix)) {
      continue
    }
    const label = name.slice(prefix.length)
    if (label !== '' && label !== 'dev' && !labels.includes(label)) {
      labels.push(label)
    }
  }
  return labels
}

export function parseTargetBranch(pullRequest: unknown): string | null {
  const targetRef = textOrNull(objectOrEmpty(pullRequest)['targetRefName'])
  return targetRef !== null && targetRef.startsWith(HEADS_PREFIX)
    ? targetRef.slice(HEADS_PREFIX.length)
    : targetRef
}

// The worst vote of the reviewers other than the PR's author.
export function parseVote(pullRequest: unknown, creatorId: string): PrVote {
  const reviewers = objectOrEmpty(pullRequest)['reviewers']
  const votes: number[] = []
  if (Array.isArray(reviewers)) {
    for (const reviewer of reviewers as readonly unknown[]) {
      const source = objectOrEmpty(reviewer)
      const vote = source['vote']
      if (source['id'] !== creatorId && typeof vote === 'number') {
        votes.push(vote)
      }
    }
  }
  if (votes.includes(VOTE_REJECTED)) {
    return 'rejected'
  }
  if (votes.includes(VOTE_WAITING)) {
    return 'waitingForAuthor'
  }
  return votes.some((vote) => vote >= VOTE_APPROVED) ? 'approved' : 'noVote'
}

export function parseMergeState(mergeStatus: string | null): PrMerge {
  if (mergeStatus === 'succeeded') {
    return 'clean'
  }
  return mergeStatus === 'conflicts' ? 'conflicts' : 'unknown'
}

// The Build policy's evaluations only; an expired build waits for a re-queue and says nothing about the code.
export function parseBuildState(evaluationsRoot: unknown): PrBuild {
  const statuses: string[] = []
  for (const evaluation of listOf(evaluationsRoot)) {
    const source = objectOrEmpty(evaluation)
    const typeId = textOrNull(objectOrEmpty(objectOrEmpty(source['configuration'])['type'])['id'])
    const isExpired = objectOrEmpty(source['context'])['isExpired'] === true
    if (typeId !== null && typeId.toLowerCase() === BUILD_POLICY_TYPE_ID && !isExpired) {
      statuses.push(textOrNull(source['status']) ?? '')
    }
  }
  if (statuses.includes('rejected') || statuses.includes('broken')) {
    return 'failed'
  }
  if (statuses.includes('queued') || statuses.includes('running')) {
    return 'running'
  }
  return statuses.includes('approved') ? 'succeeded' : 'unknown'
}

// commentType "system" covers auto-generated entries (policy updates, ref updates) no reviewer wrote.
export function isRealComment(comment: unknown): boolean {
  const source = objectOrEmpty(comment)
  return source['commentType'] !== 'system' && source['isDeleted'] !== true
}

// Every real comment (a deleted thread's too, as the notice always counted) and the live threads still open.
export function countComments(root: unknown): {
  readonly realComments: number
  readonly openThreads: number
} {
  let realComments = 0
  let openThreads = 0
  for (const thread of listOf(root)) {
    const source = objectOrEmpty(thread)
    const comments = source['comments']
    if (!Array.isArray(comments)) {
      continue
    }
    const threadReal = (comments as readonly unknown[]).filter(isRealComment).length
    realComments += threadReal
    const status = textOrNull(source['status'])?.toLowerCase()
    const isOpenStatus = status === 'active' || status === 'pending'
    if (source['isDeleted'] !== true && threadReal !== 0 && isOpenStatus) {
      openThreads += 1
    }
  }
  return { realComments, openThreads }
}

// A wrong PAT gets 401/403, or a 203 / 200 sign-in page in HTML instead of JSON.
export function classifyValidation(status: number, mediaType: string | null): CredentialCheck {
  if (status === 200) {
    return mediaType !== null && mediaType.toLowerCase().startsWith('application/json')
      ? 'valid'
      : 'rejected'
  }
  return status === 401 || status === 403 || status === 203 ? 'rejected' : 'unreachable'
}

function parseStatus(value: unknown): PrStatus {
  if (value === 'active' || value === 'completed' || value === 'abandoned') {
    return value
  }
  throw new Error('Unknown pull request status')
}

function isoOrNull(value: unknown): string | null {
  const text = textOrNull(value)
  const time = text === null ? Number.NaN : Date.parse(text)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

// A PR without an id or repository name throws: the branch it came from counts as failed.
export function parsePrs(
  root: unknown,
  creatorId: string,
  pullRequestUrl: (repository: string, pullRequestId: number) => string,
): readonly ListedPr[] {
  return listOf(root).map((item): ListedPr => {
    const source = objectOrEmpty(item)
    const pullRequestId = source['pullRequestId']
    const repositoryInfo = objectOrEmpty(source['repository'])
    const repository = textOrNull(repositoryInfo['name'])
    if (typeof pullRequestId !== 'number' || repository === null) {
      throw new Error('Pull request without an id or repository')
    }
    const status = parseStatus(source['status'])
    const isActive = status === 'active'
    const isCompleted = status === 'completed'
    const mergeCommit = textOrNull(objectOrEmpty(source['lastMergeCommit'])['commitId'])
    return {
      projectId: textOrNull(objectOrEmpty(repositoryInfo['project'])['id']),
      pr: {
        pullRequestId,
        repository,
        branch: '',
        status,
        url: pullRequestUrl(repository, pullRequestId),
        commentCount: 0,
        openThreadCount: null,
        build: 'unknown',
        merge: isActive ? parseMergeState(textOrNull(source['mergeStatus'])) : 'unknown',
        vote: isActive ? parseVote(source, creatorId) : 'unknown',
        mergeCommit: isCompleted ? mergeCommit : null,
        mergedAt: isCompleted ? isoOrNull(source['closedDate']) : null,
        targetBranch: parseTargetBranch(source),
      },
    }
  })
}

function findReviewer(reviewers: unknown, userId: string): Readonly<Record<string, unknown>> | null {
  if (!Array.isArray(reviewers)) {
    return null
  }
  let found: Readonly<Record<string, unknown>> | null = null
  for (const reviewer of reviewers as readonly unknown[]) {
    if (objectOrEmpty(reviewer)['id'] === userId) {
      found = objectOrEmpty(reviewer)
    }
  }
  return found
}

// Only a PR the user is a direct reviewer of, has not voted on or declined, and did not write; drafts are not asks yet.
export function parseReviewRequests(
  root: unknown,
  userId: string,
  pullRequestUrl: (repository: string, pullRequestId: number) => string,
): readonly PrReviewRequest[] {
  const requests: PrReviewRequest[] = []
  for (const item of listOf(root)) {
    const source = objectOrEmpty(item)
    const author = objectOrEmpty(source['createdBy'])
    const reviewer = findReviewer(source['reviewers'], userId)
    const repository = textOrNull(objectOrEmpty(source['repository'])['name'])
    const pullRequestId = source['pullRequestId']
    if (
      author['id'] === userId ||
      source['isDraft'] === true ||
      reviewer === null ||
      repository === null ||
      typeof pullRequestId !== 'number'
    ) {
      continue
    }
    const vote = typeof reviewer['vote'] === 'number' ? reviewer['vote'] : 0
    if (vote !== 0 || reviewer['hasDeclined'] === true) {
      continue
    }
    const sourceBranch = (textOrNull(source['sourceRefName']) ?? '').replace(HEADS_PREFIX, '')
    requests.push({
      repository,
      pullRequestId,
      title: textOrNull(source['title']) ?? '',
      authorName: textOrNull(author['displayName']) ?? '?',
      ticketKey: TICKET_IN_BRANCH.exec(sourceBranch)?.[0] ?? null,
      isRequired: reviewer['isRequired'] === true,
      url: pullRequestUrl(repository, pullRequestId),
      seen: false,
    })
  }
  return requests
}

// Only runs of the configured dev pipeline folder; the Test and Sonar pipelines do not deploy to dev.
export function parseDevDeployBuilds(
  root: unknown,
  pipelineFolder: string,
  buildUrl: (buildId: number) => string,
): readonly DeployBuild[] {
  const builds: DeployBuild[] = []
  for (const item of listOf(root)) {
    const source = objectOrEmpty(item)
    const definition = objectOrEmpty(source['definition'])
    const path = textOrNull(definition['path'])
    const buildId = source['id']
    const queuedAt = isoOrNull(source['queueTime'])
    const repository = textOrNull(objectOrEmpty(source['repository'])['name'])
    if (
      path === null ||
      path.toLowerCase() !== pipelineFolder.toLowerCase() ||
      typeof buildId !== 'number' ||
      queuedAt === null ||
      repository === null
    ) {
      continue
    }
    const result = textOrNull(source['result'])
    builds.push({
      buildId,
      pipelineName: textOrNull(definition['name']) ?? '',
      repository,
      sourceVersion: textOrNull(source['sourceVersion']) ?? '',
      queuedAt,
      completed: source['status'] === 'completed',
      succeeded: result === 'succeeded' || result === 'partiallySucceeded',
      url: buildUrl(buildId),
    })
  }
  return builds
}
