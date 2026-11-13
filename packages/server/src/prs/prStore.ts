import { join } from 'node:path'
import type {
  CommentAlert,
  DeployBuild,
  DevDeploy,
  PrReviewRequest,
  PrTracking,
  TrackedPr,
} from '@workday/core'
import { isRecord, readJson, writeJsonAtomic } from '../jsonFile.js'
import type { PrState } from './prService.js'

const PRS_FILE = 'prs.json'

export const EMPTY_PR_STATE: PrState = {
  tracking: {},
  baselineDone: false,
  reviews: {},
  reviewBaselineDone: false,
  commentAlerts: {},
  deploys: {},
}

const PR_STATUSES: ReadonlySet<unknown> = new Set(['active', 'completed', 'abandoned'])
const PR_BUILDS: ReadonlySet<unknown> = new Set(['unknown', 'running', 'succeeded', 'failed'])
const PR_MERGES: ReadonlySet<unknown> = new Set(['unknown', 'clean', 'conflicts'])
const PR_VOTES: ReadonlySet<unknown> = new Set([
  'unknown',
  'noVote',
  'approved',
  'waitingForAuthor',
  'rejected',
])
const DEPLOY_STATES: ReadonlySet<unknown> = new Set(['deploying', 'deployed', 'failed'])

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableIn(value: unknown, allowed: ReadonlySet<unknown>): boolean {
  return value === null || allowed.has(value)
}

function isTrackedPr(raw: unknown): raw is TrackedPr {
  return (
    isRecord(raw) &&
    PR_STATUSES.has(raw['status']) &&
    typeof raw['repository'] === 'string' &&
    typeof raw['url'] === 'string' &&
    typeof raw['commentCount'] === 'number' &&
    (raw['openThreadCount'] === null || typeof raw['openThreadCount'] === 'number') &&
    isNullableIn(raw['build'], PR_BUILDS) &&
    isNullableIn(raw['merge'], PR_MERGES) &&
    isNullableIn(raw['vote'], PR_VOTES) &&
    isNullableText(raw['mergeCommit']) &&
    isNullableText(raw['mergedAt']) &&
    isNullableText(raw['targetBranch'])
  )
}

function isReviewRequest(raw: unknown): raw is PrReviewRequest {
  return (
    isRecord(raw) &&
    typeof raw['repository'] === 'string' &&
    typeof raw['pullRequestId'] === 'number' &&
    typeof raw['title'] === 'string' &&
    typeof raw['authorName'] === 'string' &&
    isNullableText(raw['ticketKey']) &&
    typeof raw['isRequired'] === 'boolean' &&
    typeof raw['url'] === 'string' &&
    typeof raw['seen'] === 'boolean'
  )
}

function isCommentAlert(raw: unknown): raw is CommentAlert {
  return (
    isRecord(raw) &&
    typeof raw['count'] === 'number' &&
    typeof raw['url'] === 'string' &&
    typeof raw['at'] === 'string'
  )
}

function isDeployBuild(raw: unknown): raw is DeployBuild {
  return (
    isRecord(raw) &&
    typeof raw['buildId'] === 'number' &&
    typeof raw['pipelineName'] === 'string' &&
    typeof raw['repository'] === 'string' &&
    typeof raw['sourceVersion'] === 'string' &&
    typeof raw['queuedAt'] === 'string' &&
    typeof raw['completed'] === 'boolean' &&
    typeof raw['succeeded'] === 'boolean' &&
    typeof raw['url'] === 'string'
  )
}

function isDevDeploy(raw: unknown): raw is DevDeploy {
  return (
    isRecord(raw) &&
    DEPLOY_STATES.has(raw['state']) &&
    typeof raw['mergedAt'] === 'string' &&
    (raw['failedBuild'] === null || isDeployBuild(raw['failedBuild']))
  )
}

// Every entry must match, so a hand-edited file is set aside whole rather than half read.
function parseMap<Value>(
  raw: unknown,
  isValue: (entry: unknown) => entry is Value,
): Readonly<Record<string, Value>> | null {
  if (!isRecord(raw)) {
    return null
  }
  const entries = Object.entries(raw)
  return entries.every(([, entry]) => isValue(entry))
    ? (Object.fromEntries(entries) as Record<string, Value>)
    : null
}

function parsePrState(raw: unknown): PrState | null {
  if (
    !isRecord(raw) ||
    typeof raw['baselineDone'] !== 'boolean' ||
    typeof raw['reviewBaselineDone'] !== 'boolean'
  ) {
    return null
  }
  const tracking: PrTracking | null = parseMap(raw['tracking'], isTrackedPr)
  const reviews = parseMap(raw['reviews'], isReviewRequest)
  const commentAlerts = parseMap(raw['commentAlerts'], isCommentAlert)
  const deploys = parseMap(raw['deploys'], isDevDeploy)
  if (tracking === null || reviews === null || commentAlerts === null || deploys === null) {
    return null
  }
  return {
    tracking,
    baselineDone: raw['baselineDone'],
    reviews,
    reviewBaselineDone: raw['reviewBaselineDone'],
    commentAlerts,
    deploys,
  }
}

export function loadPrState(dataDir: string): PrState {
  return readJson(join(dataDir, PRS_FILE), parsePrState, EMPTY_PR_STATE)
}

export async function savePrState(dataDir: string, state: PrState): Promise<void> {
  await writeJsonAtomic(join(dataDir, PRS_FILE), state)
}
