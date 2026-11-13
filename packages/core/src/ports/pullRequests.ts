import type { DeployBuild } from '../devDeploys.js'
import type { PrLookup, PrReviewRequest } from '../prTracking.js'

export type PullRequestsValidation =
  | { readonly ok: true; readonly displayName: string }
  | { readonly ok: false; readonly reason: 'rejected' | 'unreachable' }

export interface PullRequests {
  validate(): Promise<PullRequestsValidation>
  // Throws NetworkFailure when there is no response at all.
  ticketPrs(ticketKey: string): Promise<PrLookup>
  // Review requests come back with seen: false.
  reviewRequests(): Promise<readonly PrReviewRequest[]>
  devDeployBuilds(since: string): Promise<readonly DeployBuild[]>
}

export class NetworkFailure extends Error {}
