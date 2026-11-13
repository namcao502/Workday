import { describe, expect, it } from 'vitest'
import {
  addCommentAlert,
  areAllPrsClosed,
  detectChanges,
  isBlocked,
  isDevPrMerged,
  latestPrs,
  mergeReviewRequests,
  repoLabel,
  reviewRequestKey,
  shippedKeys,
  targetSuffix,
  type CommentAlert,
  type PrRead,
  type PrReviewRequest,
  type PrTracking,
  type TrackedPr,
} from './prTracking.js'

const BE = 'Backend-DotNet'
const FE = 'Portal-Angular'

function pr(id: number, branch: string, status: PrRead['status'], commentCount: number): PrRead {
  return {
    pullRequestId: id,
    repository: BE,
    branch,
    status,
    url: `https://example.test/${String(id)}`,
    commentCount,
    openThreadCount: null,
    build: 'unknown',
    merge: 'unknown',
    vote: 'unknown',
    mergeCommit: null,
    mergedAt: null,
    targetBranch: null,
  }
}

function tracked(status: TrackedPr['status'], overrides: Partial<TrackedPr> = {}): TrackedPr {
  return {
    status,
    repository: BE,
    url: '',
    commentCount: 0,
    openThreadCount: null,
    build: null,
    merge: null,
    vote: null,
    mergeCommit: null,
    mergedAt: null,
    targetBranch: null,
    ...overrides,
  }
}

const seenState = { build: 'running', merge: 'clean', vote: 'noVote' } as const

describe('detectChanges', () => {
  it('only records a baseline when a PR is seen for the first time', () => {
    const result = detectChanges({}, 'MDP-1', [pr(1, 'main', 'completed', 3)])

    expect(result.changes).toEqual([])
    expect(result.tracking['MDP-1|main|1']).toEqual(
      tracked('completed', { url: 'https://example.test/1', commentCount: 3 }),
    )
  })

  it('keeps the open thread count', () => {
    const read = { ...pr(1, 'main', 'active', 3), openThreadCount: 2 }

    const result = detectChanges({}, 'MDP-1', [read])

    expect(result.tracking['MDP-1|main|1']?.openThreadCount).toBe(2)
  })

  it('reports a merge and new comments when a PR changed', () => {
    const tracking = { 'MDP-1|main|1': tracked('active', { commentCount: 1 }) }

    const result = detectChanges(tracking, 'MDP-1', [pr(1, 'main', 'completed', 3)])

    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]).toMatchObject({ merged: true, newComments: 2 })
  })

  it('reports nothing when two PRs on the same branch are unchanged', () => {
    const prs = [pr(1, 'main', 'abandoned', 0), pr(2, 'main', 'completed', 5)]
    const first = detectChanges({}, 'MDP-1', prs)

    expect(detectChanges(first.tracking, 'MDP-1', prs).changes).toEqual([])
  })

  it('returns the same tracking when nothing changed', () => {
    const prs = [pr(1, 'main', 'completed', 3)]
    const first = detectChanges({}, 'MDP-1', prs)

    expect(detectChanges(first.tracking, 'MDP-1', prs).tracking).toBe(first.tracking)
  })

  it('keeps the merge commit and time', () => {
    const tracking: PrTracking = { 'MDP-1|dev|1': tracked('active') }
    const read = {
      ...pr(1, 'dev', 'completed', 0),
      mergeCommit: 'c338c33b',
      mergedAt: '2026-10-20T22:18:45Z',
    }

    const stored = detectChanges(tracking, 'MDP-1', [read]).tracking['MDP-1|dev|1']

    expect([stored?.mergeCommit, stored?.mergedAt]).toEqual(['c338c33b', '2026-10-20T22:18:45Z'])
  })

  it('notifies a failed build once', () => {
    const tracking: PrTracking = { 'MDP-1|main|1': tracked('active', { ...seenState }) }
    const failed: PrRead = {
      ...pr(1, 'main', 'active', 0),
      build: 'failed',
      merge: 'clean',
      vote: 'noVote',
    }

    const first = detectChanges(tracking, 'MDP-1', [failed])
    const second = detectChanges(first.tracking, 'MDP-1', [failed])

    expect(first.changes[0]?.buildFailed).toBe(true)
    expect(second.changes).toEqual([])
  })

  it('keeps the stored build and merge when the read is unknown', () => {
    const tracking: PrTracking = {
      'MDP-1|main|1': tracked('active', { build: 'failed', merge: 'conflicts', vote: 'noVote' }),
    }

    const result = detectChanges(tracking, 'MDP-1', [{ ...pr(1, 'main', 'active', 0), vote: 'noVote' }])

    expect(result.changes).toEqual([])
    expect(result.tracking['MDP-1|main|1']).toMatchObject({ build: 'failed', merge: 'conflicts' })
  })

  it('treats an entry never read as a baseline', () => {
    const tracking: PrTracking = { 'MDP-1|main|1': tracked('active') }
    const read: PrRead = {
      ...pr(1, 'main', 'active', 0),
      build: 'failed',
      merge: 'conflicts',
      vote: 'approved',
    }

    const result = detectChanges(tracking, 'MDP-1', [read])

    expect(result.changes).toEqual([])
    expect(result.tracking['MDP-1|main|1']).toMatchObject({
      build: 'failed',
      merge: 'conflicts',
      vote: 'approved',
    })
  })

  it('notifies conflict and vote changes', () => {
    const tracking: PrTracking = {
      'MDP-1|main|1': tracked('active', { build: 'succeeded', merge: 'clean', vote: 'noVote' }),
      'MDP-1|dev|2': tracked('active', { build: 'succeeded', merge: 'clean', vote: 'approved' }),
    }
    const main: PrRead = {
      ...pr(1, 'main', 'active', 0),
      build: 'succeeded',
      merge: 'conflicts',
      vote: 'waitingForAuthor',
    }
    const dev: PrRead = {
      ...pr(2, 'dev', 'active', 0),
      build: 'succeeded',
      merge: 'clean',
      vote: 'noVote',
    }

    const { changes } = detectChanges(tracking, 'MDP-1', [main, dev])

    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      conflicted: true,
      newVote: 'waitingForAuthor',
      buildFailed: false,
    })
    expect(changes[0]?.pr.pullRequestId).toBe(1)
  })

  it('ignores the state of a merged PR', () => {
    const tracking: PrTracking = { 'MDP-1|main|1': tracked('completed', { ...seenState }) }
    const read: PrRead = {
      ...pr(1, 'main', 'completed', 0),
      build: 'failed',
      merge: 'conflicts',
      vote: 'rejected',
    }

    expect(detectChanges(tracking, 'MDP-1', [read]).changes).toEqual([])
  })

  it('keeps the target branch when the read has none', () => {
    const tracking: PrTracking = { 'MDP-2|main|1': tracked('active', { targetBranch: 'MDP-1' }) }

    const result = detectChanges(tracking, 'MDP-2', [pr(1, 'main', 'active', 0)])

    expect(result.tracking['MDP-2|main|1']?.targetBranch).toBe('MDP-1')
  })
})

describe('areAllPrsClosed', () => {
  it('is true when every PR is completed or abandoned', () => {
    const tracking = { 'MDP-1|main|1': tracked('completed'), 'MDP-1|dev|2': tracked('abandoned') }
    expect(areAllPrsClosed(tracking, 'MDP-1')).toBe(true)
  })

  it('is false when any PR is active', () => {
    const tracking = { 'MDP-1|main|1': tracked('completed'), 'MDP-1|dev|2': tracked('active') }
    expect(areAllPrsClosed(tracking, 'MDP-1')).toBe(false)
  })

  it('is false when only a key with the same prefix has PRs', () => {
    expect(areAllPrsClosed({ 'MDP-10|main|1': tracked('completed') }, 'MDP-1')).toBe(false)
  })
})

describe('isDevPrMerged', () => {
  it('is true when a dev PR is completed', () => {
    const tracking = { 'MDP-1|main|1': tracked('active'), 'MDP-1|dev|2': tracked('completed') }
    expect(isDevPrMerged(tracking, 'MDP-1')).toBe(true)
  })

  it('is false when only the main PR is completed', () => {
    const tracking = { 'MDP-1|main|1': tracked('completed'), 'MDP-1|dev|2': tracked('active') }
    expect(isDevPrMerged(tracking, 'MDP-1')).toBe(false)
  })

  it('is false when the backend merged but the frontend dev PR is still open', () => {
    const tracking = {
      'MDP-1|dev|1': tracked('completed'),
      'MDP-1|dev|2': tracked('active', { repository: FE }),
    }
    expect(isDevPrMerged(tracking, 'MDP-1')).toBe(false)
  })

  it('ignores abandoned dev PRs', () => {
    const tracking = { 'MDP-1|dev|1': tracked('completed'), 'MDP-1|dev|2': tracked('abandoned') }
    expect(isDevPrMerged(tracking, 'MDP-1')).toBe(true)
  })

  it('ignores other tickets whose key starts with this one', () => {
    expect(isDevPrMerged({ 'MDP-10|dev|2': tracked('completed') }, 'MDP-1')).toBe(false)
  })
})

describe('targetSuffix', () => {
  it.each([
    [null, ''],
    ['main', ''],
    ['development', ''],
    ['MDP-1', ' -> MDP-1'],
  ])('target %j gives %j', (target, expected) => {
    expect(targetSuffix(target)).toBe(expected)
  })
})

describe('latestPrs and isBlocked', () => {
  const labels = { [BE]: 'BE', [FE]: 'FE Portal' }

  it('keeps the highest PR id per repo and branch', () => {
    const tracking = { 'MDP-1|main|1': tracked('abandoned'), 'MDP-1|main|2': tracked('active') }

    const latest = latestPrs('MDP-1', tracking, labels)

    expect(latest.map((tp) => tp.pullRequestId)).toEqual([2])
  })

  it('orders repos by the configured labels', () => {
    const tracking = {
      'MDP-1|main|1': tracked('active', { repository: FE }),
      'MDP-1|dev|2': tracked('active'),
      'MDP-1|main|3': tracked('active'),
      'MDP-1|main|4': tracked('active', { repository: 'Other' }),
    }

    const latest = latestPrs('MDP-1', tracking, labels)

    expect(latest.map((tp) => tp.key)).toEqual([
      'MDP-1|main|3',
      'MDP-1|dev|2',
      'MDP-1|main|1',
      'MDP-1|main|4',
    ])
  })

  it('ignores other tickets and malformed keys', () => {
    const tracking = { 'MDP-10|main|1': tracked('active'), 'MDP-1|main': tracked('active') }
    expect(latestPrs('MDP-1', tracking, labels)).toEqual([])
  })

  it('blocks an open PR that failed, conflicts or was sent back, not an approved one', () => {
    expect(isBlocked(tracked('active', { build: 'failed' }))).toBe(true)
    expect(isBlocked(tracked('active', { merge: 'conflicts' }))).toBe(true)
    expect(isBlocked(tracked('active', { vote: 'waitingForAuthor' }))).toBe(true)
    expect(isBlocked(tracked('active', { vote: 'approved' }))).toBe(false)
    expect(isBlocked(tracked('completed', { build: 'failed' }))).toBe(false)
  })

  it('ships a done ticket once its latest main PRs merged, ignoring abandoned ones', () => {
    const tracking = {
      'MDP-1|main|1': tracked('completed'),
      'MDP-1|main|2': tracked('abandoned', { repository: FE }),
      'MDP-2|main|3': tracked('active'),
      'MDP-3|main|4': tracked('abandoned'),
    }

    expect(shippedKeys(['MDP-3', 'MDP-2', 'MDP-1'], tracking, labels)).toEqual(['MDP-1'])
  })

  it('labels a repo from config, else by its name', () => {
    expect(repoLabel(BE, labels)).toBe('BE')
    expect(repoLabel('Other', labels)).toBe('Other')
  })
})

function request(pullRequestId: number, seen = false): PrReviewRequest {
  return {
    repository: BE,
    pullRequestId,
    title: `PR ${String(pullRequestId)}`,
    authorName: 'Minh',
    ticketKey: 'MDP-1',
    isRequired: false,
    url: '',
    seen,
  }
}

function saved(...requests: PrReviewRequest[]): Record<string, PrReviewRequest> {
  return Object.fromEntries(requests.map((r) => [reviewRequestKey(r), r]))
}

describe('mergeReviewRequests', () => {
  it('saves a baseline without new requests', () => {
    const result = mergeReviewRequests({}, [request(1), request(2)], true)

    expect(result.added).toEqual([])
    expect(Object.keys(result.saved).sort()).toEqual([`${BE}|1`, `${BE}|2`])
  })

  it('reports only requests not saved before and keeps seen', () => {
    const result = mergeReviewRequests(saved(request(1, true)), [request(1), request(2)], false)

    expect(result.added.map((r) => r.pullRequestId)).toEqual([2])
    expect(result.saved[`${BE}|1`]?.seen).toBe(true)
    expect(result.saved[`${BE}|2`]?.seen).toBe(false)
  })

  it('drops requests no longer listed', () => {
    const previous = saved(request(1), request(2))

    const result = mergeReviewRequests(previous, [request(2)], false)

    expect(result.added).toEqual([])
    expect(Object.keys(result.saved)).toEqual([`${BE}|2`])
    expect(Object.keys(previous)).toHaveLength(2)
  })
})

describe('addCommentAlert', () => {
  it('sums counts and keeps the latest url', () => {
    const first = addCommentAlert({}, 'MDP-1', 2, 'https://pr/1', '2026-10-01T09:00:00Z')

    const second = addCommentAlert(first, 'MDP-1', 3, 'https://pr/2', '2026-10-01T11:00:00Z')

    expect(second['MDP-1']).toEqual({ count: 5, url: 'https://pr/2', at: '2026-10-01T11:00:00Z' })
  })

  it('ignores zero', () => {
    const alerts: Record<string, CommentAlert> = {}
    expect(addCommentAlert(alerts, 'MDP-1', 0, 'u', 'at')).toBe(alerts)
  })

  it('does not mutate the input', () => {
    const alerts = { 'MDP-1': { count: 1, url: 'u1', at: 'a' } }

    addCommentAlert(alerts, 'MDP-1', 4, 'u2', 'b')
    addCommentAlert(alerts, 'MDP-9', 1, 'u3', 'b')

    expect(alerts).toEqual({ 'MDP-1': { count: 1, url: 'u1', at: 'a' } })
  })
})
