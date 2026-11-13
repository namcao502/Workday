import {
  NetworkFailure,
  type AzureDevOpsConfig,
  type DeployBuild,
  type PrBuild,
  type PrLookup,
  type PrRead,
  type PrReviewRequest,
  type PullRequests,
  type PullRequestsValidation,
} from '@workday/core'
import { isRecord } from '../jsonFile.js'
import {
  classifyValidation,
  countComments,
  parseBuildState,
  parseDevDeployBuilds,
  parseExtraBranchLabels,
  parsePrs,
  parseReviewRequests,
} from './parseAdo.js'

const REQUEST_TIMEOUT_MILLISECONDS = 15_000
const API_VERSION = '7.1'
const CONNECTION_API_VERSION = '7.1-preview.1'
const MAX_REVIEW_REQUESTS = 100
const MAX_BUILDS = 1000

class HttpFailure extends Error {}

// A timeout aborts the request or its body read; neither has a status to report.
function isNoResponse(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
  )
}

export class AzureDevOpsClient implements PullRequests {
  private readonly authorization: string
  private readonly organizationBase: string
  private readonly projectBase: string
  private userId: string | null = null

  constructor(
    private readonly config: AzureDevOpsConfig,
    pat: string,
    private readonly fetchFunction: typeof fetch = fetch,
  ) {
    this.authorization = `Basic ${Buffer.from(`:${pat}`).toString('base64')}`
    this.organizationBase = `https://dev.azure.com/${encodeURIComponent(config.organization)}`
    this.projectBase = `${this.organizationBase}/${encodeURIComponent(config.project)}`
  }

  async validate(): Promise<PullRequestsValidation> {
    try {
      const response = await this.send(this.connectionUrl())
      const mediaType = response.headers.get('content-type')
      const check = classifyValidation(response.status, mediaType)
      if (check !== 'valid') {
        return { ok: false, reason: check }
      }
      const body: unknown = await response.json()
      const user = isRecord(body) ? body['authenticatedUser'] : undefined
      const id = isRecord(user) ? user['id'] : undefined
      if (typeof id === 'string' && id !== '') {
        this.userId = id
      }
      const name = isRecord(user) ? user['providerDisplayName'] : undefined
      return { ok: true, displayName: typeof name === 'string' ? name : this.config.organization }
    } catch {
      return { ok: false, reason: 'unreachable' }
    }
  }

  // Every branch is tried; a failed one marks the lookup incomplete so a partial read is never a baseline.
  async ticketPrs(ticketKey: string): Promise<PrLookup> {
    // Throws on failure: unfiltered, a teammate's same-named branch PR would be tracked as ours.
    const creatorId = await this.currentUserId()
    const prs: PrRead[] = []
    let complete = true
    const readBranch = async (label: string, branchName: string): Promise<void> => {
      try {
        prs.push(...(await this.branchPrs(label, branchName, creatorId)))
      } catch (error: unknown) {
        if (error instanceof NetworkFailure) {
          throw error
        }
        complete = false
      }
    }
    await readBranch('main', ticketKey)
    await readBranch('dev', `${ticketKey}-dev`)

    // The ticket's other branches, read in the repos its PRs are in and in the configured repos.
    const repositories = new Set([...prs.map((pr) => pr.repository), ...Object.keys(this.config.repoLabels)])
    const extraLabels = new Set<string>()
    for (const repository of repositories) {
      try {
        const refs = await this.getJson(
          `${this.projectBase}/_apis/git/repositories/${encodeURIComponent(repository)}/refs` +
            `?filter=${encodeURIComponent(`heads/${ticketKey}-`)}&api-version=${API_VERSION}`,
        )
        parseExtraBranchLabels(ticketKey, refs).forEach((label) => extraLabels.add(label))
      } catch (error: unknown) {
        if (error instanceof NetworkFailure) {
          throw error
        }
        complete = false
      }
    }
    for (const label of [...extraLabels].sort()) {
      await readBranch(label, `${ticketKey}-${label}`)
    }
    return { prs, complete }
  }

  async reviewRequests(): Promise<readonly PrReviewRequest[]> {
    const userId = await this.currentUserId()
    const root = await this.getJson(
      `${this.projectBase}/_apis/git/pullrequests?searchCriteria.reviewerId=${encodeURIComponent(userId)}` +
        `&searchCriteria.status=active&$top=${String(MAX_REVIEW_REQUESTS)}&api-version=${API_VERSION}`,
    )
    return parseReviewRequests(root, userId, (repository, id) => this.pullRequestUrl(repository, id))
  }

  // Needs the PAT's Build (Read) scope.
  async devDeployBuilds(since: string): Promise<readonly DeployBuild[]> {
    const folder = this.config.devPipelineFolder
    if (folder === null) {
      return []
    }
    const root = await this.getJson(
      `${this.projectBase}/_apis/build/builds?branchName=refs/heads/development` +
        `&minTime=${encodeURIComponent(since)}&$top=${String(MAX_BUILDS)}&api-version=${API_VERSION}`,
    )
    return parseDevDeployBuilds(root, folder, (buildId) => this.buildUrl(buildId))
  }

  private connectionUrl(): string {
    return `${this.organizationBase}/_apis/connectionData?api-version=${CONNECTION_API_VERSION}`
  }

  private pullRequestUrl(repository: string, pullRequestId: number): string {
    return `${this.projectBase}/_git/${encodeURIComponent(repository)}/pullrequest/${String(pullRequestId)}`
  }

  private buildUrl(buildId: number): string {
    return `${this.projectBase}/_build/results?buildId=${String(buildId)}`
  }

  // The PAT owner's identity id, which is also PR.createdBy.id; cached after the first read.
  private async currentUserId(): Promise<string> {
    if (this.userId !== null) {
      return this.userId
    }
    const body = await this.getJson(this.connectionUrl())
    const user = isRecord(body) ? body['authenticatedUser'] : undefined
    const id = isRecord(user) ? user['id'] : undefined
    if (typeof id !== 'string' || id === '') {
      throw new Error('connectionData returned no authenticatedUser.id')
    }
    this.userId = id
    return id
  }

  private async branchPrs(label: string, branchName: string, creatorId: string): Promise<PrRead[]> {
    const sourceRef = encodeURIComponent(`refs/heads/${branchName}`)
    const root = await this.getJson(
      `${this.projectBase}/_apis/git/pullrequests?searchCriteria.sourceRefName=${sourceRef}` +
        `&searchCriteria.creatorId=${encodeURIComponent(creatorId)}&searchCriteria.status=all&api-version=${API_VERSION}`,
    )
    const reads: PrRead[] = []
    const listed = parsePrs(root, creatorId, (repository, id) => this.pullRequestUrl(repository, id))
    for (const { pr, projectId } of listed) {
      const threads = await this.getJson(
        `${this.projectBase}/_apis/git/repositories/${encodeURIComponent(pr.repository)}` +
          `/pullrequests/${String(pr.pullRequestId)}/threads?api-version=${API_VERSION}`,
      )
      const { realComments, openThreads } = countComments(threads)
      const build = pr.status === 'active' ? await this.buildState(projectId, pr.pullRequestId) : 'unknown'
      reads.push({ ...pr, branch: label, commentCount: realComments, openThreadCount: openThreads, build })
    }
    return reads
  }

  // A failed read (a PAT without policy access, a bad response) is unknown, so it never costs the PR its other news.
  private async buildState(projectId: string | null, pullRequestId: number): Promise<PrBuild> {
    if (projectId === null) {
      return 'unknown'
    }
    const artifactId = encodeURIComponent(
      `vstfs:///CodeReview/CodeReviewId/${projectId}/${String(pullRequestId)}`,
    )
    try {
      const root = await this.getJson(
        `${this.projectBase}/_apis/policy/evaluations?artifactId=${artifactId}&api-version=${CONNECTION_API_VERSION}`,
      )
      return parseBuildState(root)
    } catch (error: unknown) {
      if (error instanceof NetworkFailure) {
        throw error
      }
      return 'unknown'
    }
  }

  // No response at all is a NetworkFailure; an HTTP error status or a bad body is a plain Error.
  private async getJson(url: string): Promise<unknown> {
    const response = await this.send(url)
    if (!response.ok) {
      throw new HttpFailure(`Azure DevOps answered ${String(response.status)}`)
    }
    try {
      return await response.json()
    } catch (error: unknown) {
      if (isNoResponse(error)) {
        throw new NetworkFailure('Azure DevOps did not answer')
      }
      throw new HttpFailure('Azure DevOps sent a body that is not JSON')
    }
  }

  private async send(url: string): Promise<Response> {
    try {
      return await this.fetchFunction(url, {
        method: 'GET',
        headers: { Authorization: this.authorization, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
      })
    } catch {
      throw new NetworkFailure('Azure DevOps did not answer')
    }
  }
}
