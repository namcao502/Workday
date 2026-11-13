import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BUILD_POLICY_TYPE_ID,
  classifyValidation,
  countComments,
  parseBuildState,
  parseDevDeployBuilds,
  parseExtraBranchLabels,
  parseMergeState,
  parsePrs,
  parseReviewRequests,
  parseTargetBranch,
  parseVote,
} from './parseAdo.js'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as unknown
}

const prUrl = (repository: string, id: number): string => `https://ado/${repository}/${String(id)}`

describe('parseExtraBranchLabels', () => {
  it("keeps the ticket's other branches once each, without -dev", () => {
    expect(parseExtraBranchLabels('MDP-9379', fixture('refs.json'))).toEqual(['dev-2', 'fix'])
  })
})

describe('parseTargetBranch', () => {
  it('drops the refs/heads prefix', () => {
    expect(parseTargetBranch({ targetRefName: 'refs/heads/MDP-7531' })).toBe('MDP-7531')
    expect(parseTargetBranch({ targetRefName: 'refs/heads/main' })).toBe('main')
    expect(parseTargetBranch({})).toBeNull()
  })
})

describe('parseVote', () => {
  it("ignores the creator's own vote", () => {
    const pr = { reviewers: [{ id: 'me', vote: 10 }, { id: 'lead', vote: 0 }] }
    expect(parseVote(pr, 'me')).toBe('noVote')
  })

  it.each([
    [[{ id: 'a', vote: 10 }, { id: 'b', vote: -5 }, { id: 'c', vote: -10 }], 'rejected'],
    [[{ id: 'a', vote: 10 }, { id: 'b', vote: -5 }], 'waitingForAuthor'],
    [[{ id: 'a', vote: 5 }], 'approved'],
    [[], 'noVote'],
  ])('the worst vote wins: %j -> %s', (reviewers, expected) => {
    expect(parseVote({ reviewers }, 'me')).toBe(expected)
  })
})

describe('parseMergeState', () => {
  it.each([
    ['succeeded', 'clean'],
    ['conflicts', 'conflicts'],
    ['queued', 'unknown'],
    ['rejectedByPolicy', 'unknown'],
    [null, 'unknown'],
  ])('%s -> %s', (status, expected) => {
    expect(parseMergeState(status)).toBe(expected)
  })
})

describe('parseBuildState', () => {
  const build = (status: string, extra: object = {}): object => ({
    status,
    configuration: { type: { id: BUILD_POLICY_TYPE_ID } },
    ...extra,
  })
  const otherPolicy = (status: string): object => ({
    status,
    configuration: { type: { id: 'fa4e907d-c16b-4a4c-9dfa-4906e5d171dd' } },
  })

  it('is failed when a build policy is rejected, and ignores other policies', () => {
    expect(parseBuildState({ value: [build('rejected'), build('approved')] })).toBe('failed')
    expect(parseBuildState({ value: [otherPolicy('rejected'), build('running')] })).toBe('running')
  })

  it('skips an expired evaluation and is unknown without a build policy', () => {
    const expired = build('rejected', { context: { isExpired: true } })
    expect(parseBuildState({ value: [expired, build('approved')] })).toBe('succeeded')
    expect(parseBuildState({ value: [otherPolicy('approved')] })).toBe('unknown')
  })
})

describe('countComments', () => {
  it('counts real comments and the live threads still open', () => {
    expect(countComments(fixture('threads.json'))).toEqual({ realComments: 5, openThreads: 2 })
  })
})

describe('classifyValidation', () => {
  it.each([
    [200, 'application/json; charset=utf-8', 'valid'],
    [200, 'text/html', 'rejected'],
    [203, 'text/html', 'rejected'],
    [401, null, 'rejected'],
    [403, null, 'rejected'],
    [500, 'application/json', 'unreachable'],
    [404, null, 'unreachable'],
  ])('%i %s -> %s', (status, mediaType, expected) => {
    expect(classifyValidation(status, mediaType)).toBe(expected)
  })
})

describe('parsePrs', () => {
  it('reads merge and vote of an active PR and the merge commit of a completed one', () => {
    const listed = parsePrs(fixture('pullrequests.json'), 'me', prUrl)
    expect(listed.map((item) => item.projectId)).toEqual(['proj-1', 'proj-1'])
    expect(listed[0]?.pr).toMatchObject({
      pullRequestId: 101,
      repository: 'Backend',
      status: 'active',
      merge: 'conflicts',
      vote: 'waitingForAuthor',
      mergeCommit: null,
      mergedAt: null,
      targetBranch: 'development',
      url: 'https://ado/Backend/101',
    })
    expect(listed[1]?.pr).toMatchObject({
      status: 'completed',
      merge: 'unknown',
      vote: 'unknown',
      mergeCommit: 'c338c33b',
      mergedAt: '2026-10-20T22:10:00.000Z',
    })
  })

  it('throws on an unknown status so the branch counts as failed', () => {
    const root = { value: [{ pullRequestId: 1, status: 'weird', repository: { name: 'R' } }] }
    expect(() => parsePrs(root, 'me', prUrl)).toThrow()
  })
})

describe('parseReviewRequests', () => {
  it('keeps a PR waiting on my vote and drops voted, declined, draft and own PRs', () => {
    const requests = parseReviewRequests(fixture('reviews.json'), 'me', prUrl)
    expect(requests.map((request) => request.pullRequestId)).toEqual([42, 7])
    expect(requests[0]).toEqual({
      repository: 'Portal',
      pullRequestId: 42,
      title: 'MDP-9001 Fix totals',
      authorName: 'Minh Dinh',
      ticketKey: 'MDP-9001',
      isRequired: true,
      url: 'https://ado/Portal/42',
      seen: false,
    })
  })

  it('leaves the key null for a branch without one', () => {
    const request = parseReviewRequests(fixture('reviews.json'), 'me', prUrl)[1]
    expect(request?.ticketKey).toBeNull()
    expect(request?.authorName).toBe('?')
  })
})

describe('parseDevDeployBuilds', () => {
  it('keeps only runs of the dev pipeline folder', () => {
    const builds = parseDevDeployBuilds(
      fixture('builds.json'),
      '\\development-pipelines',
      (id) => `https://ado/build/${String(id)}`,
    )
    expect(builds).toEqual([
      {
        buildId: 119992,
        pipelineName: 'Backend - External Portal Service',
        repository: 'Backend',
        sourceVersion: 'c338c33b',
        queuedAt: '2026-10-20T22:18:50.000Z',
        completed: true,
        succeeded: true,
        url: 'https://ado/build/119992',
      },
    ])
  })
})
