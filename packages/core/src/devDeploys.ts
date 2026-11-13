import { isDevPrMerged, type TrackedPr, type PrTracking } from './prTracking.js'
import { stepsToReadyToTest } from './readyToTest.js'

export type DeployState = 'deploying' | 'deployed' | 'failed'

export interface DeployBuild {
  readonly buildId: number
  readonly pipelineName: string
  readonly repository: string
  readonly sourceVersion: string
  readonly queuedAt: string
  readonly completed: boolean
  readonly succeeded: boolean
  readonly url: string
}

export interface DevMerge {
  readonly repository: string
  readonly mergeCommit: string
  readonly mergedAt: string
}

export interface DevDeploy {
  readonly state: DeployState
  readonly mergedAt: string
  readonly failedBuild: DeployBuild | null
}

export const NO_PIPELINE_GRACE_MS = 10 * 60 * 1000
export const WATCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
export const NOTICE_WINDOW_MS = 24 * 60 * 60 * 1000
// How far before the earliest merge the build read starts: the merge commit's runs can be queued before closedDate.
export const BUILD_READ_SLACK_MS = 30 * 60 * 1000

function time(instant: string): number {
  return Date.parse(instant)
}

// A failed pipeline counts once a later run of it succeeded, since that run's commit contains the merge.
export function repoState(merge: DevMerge, builds: readonly DeployBuild[], now: string): DevDeploy {
  const nowMs = time(now)
  const repoBuilds = builds.filter((build) => build.repository === merge.repository)
  const triggered = [
    ...new Set(
      repoBuilds
        .filter((build) => build.sourceVersion === merge.mergeCommit)
        .map((build) => build.pipelineName),
    ),
  ].sort()
  const mergedAt = time(merge.mergedAt)
  // A change no pipeline's paths cover deploys nothing; the grace waits for runs still being queued.
  if (triggered.length === 0) {
    const state = nowMs - mergedAt >= NO_PIPELINE_GRACE_MS ? 'deployed' : 'deploying'
    return { state, mergedAt: merge.mergedAt, failedBuild: null }
  }

  let running = false
  for (const pipelineName of triggered) {
    // The merge commit's own runs are queued by the push, which can precede the PR's closedDate.
    const runs = repoBuilds.filter(
      (build) =>
        build.pipelineName === pipelineName &&
        (build.sourceVersion === merge.mergeCommit || time(build.queuedAt) >= mergedAt),
    )
    if (runs.some((run) => run.succeeded)) {
      continue
    }
    if (runs.some((run) => !run.completed)) {
      running = true
      continue
    }
    const latest = runs.reduce((a, b) => (time(b.queuedAt) > time(a.queuedAt) ? b : a))
    return { state: 'failed', mergedAt: merge.mergedAt, failedBuild: latest }
  }
  return { state: running ? 'deploying' : 'deployed', mergedAt: merge.mergedAt, failedBuild: null }
}

// Failed beats deploying beats deployed: the ticket is on dev only once every repo's merge is.
export function ticketState(
  merges: readonly DevMerge[],
  builds: readonly DeployBuild[],
  now: string,
): DevDeploy {
  const repoDeploys = merges.map((merge) => repoState(merge, builds, now))
  const mergedAt = merges.reduce((a, b) => (time(b.mergedAt) > time(a.mergedAt) ? b : a)).mergedAt
  const failed = repoDeploys.find((deploy) => deploy.state === 'failed')
  if (failed !== undefined) {
    return { state: 'failed', mergedAt, failedBuild: failed.failedBuild }
  }
  const deploying = repoDeploys.some((deploy) => deploy.state === 'deploying')
  return { state: deploying ? 'deploying' : 'deployed', mergedAt, failedBuild: null }
}

function latestDevMerge(entries: readonly (readonly [number, TrackedPr])[]): TrackedPr {
  return entries.reduce((a, b) => (b[0] > a[0] ? b : a))[1]
}

// Tickets short of Ready to Test whose dev PRs all merged within the watch window, with each repo's newest merge.
export function mergesToWatch(
  tracking: PrTracking,
  statusByTicket: Readonly<Record<string, string | null>>,
  path: readonly string[],
  now: string,
): Readonly<Record<string, readonly DevMerge[]>> {
  const watched: Record<string, readonly DevMerge[]> = {}
  for (const [ticketKey, status] of Object.entries(statusByTicket)) {
    if (stepsToReadyToTest(status, path).length === 0 || !isDevPrMerged(tracking, ticketKey)) {
      continue
    }
    const byRepo = new Map<string, (readonly [number, TrackedPr])[]>()
    for (const [key, pr] of Object.entries(tracking)) {
      if (!key.startsWith(`${ticketKey}|dev|`) || pr.status !== 'completed') {
        continue
      }
      const entries = byRepo.get(pr.repository) ?? []
      byRepo.set(pr.repository, [...entries, [Number(key.split('|')[2]), pr]])
    }
    const latest = [...byRepo.values()].map(latestDevMerge)
    const merges: DevMerge[] = []
    for (const pr of latest) {
      if (pr.mergeCommit !== null && pr.mergedAt !== null) {
        merges.push({ repository: pr.repository, mergeCommit: pr.mergeCommit, mergedAt: pr.mergedAt })
      }
    }
    if (merges.length !== latest.length) {
      continue
    }
    const newest = Math.max(...merges.map((merge) => time(merge.mergedAt)))
    if (time(now) - newest <= WATCH_WINDOW_MS) {
      watched[ticketKey] = merges
    }
  }
  return watched
}

// A ticket seen for the first time is announced only for a recent merge, so an upgrade does not replay old deploys.
export function shouldNotifyDeploy(
  previous: DevDeploy | null,
  current: DevDeploy,
  now: string,
): boolean {
  if (current.state === 'deploying') {
    return false
  }
  if (previous === null) {
    return time(now) - time(current.mergedAt) <= NOTICE_WINDOW_MS
  }
  return previous.state !== current.state
}
