import type { DeployBuild, PrLookup, PrReviewRequest } from '@workday/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { boardWith, deferred, FakePullRequests, makeTicket } from '../testing/fakes.js'
import { FLOW, inProgress, NOW, pr, PrHarness, tracked } from '../testing/prHarness.js'

const MERGED_AT = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString()
const BUILD: DeployBuild = {
  buildId: 7,
  pipelineName: 'api-dev',
  repository: 'Backend',
  sourceVersion: 'abc',
  queuedAt: MERGED_AT,
  completed: false,
  succeeded: false,
  url: 'https://ado.example/build/7',
}
const REQUEST: PrReviewRequest = {
  repository: 'Backend',
  pullRequestId: 5,
  title: 'Add export',
  authorName: 'Lan',
  ticketKey: null,
  isRequired: true,
  url: 'https://ado.example/pr/5',
  seen: false,
}

let h = new PrHarness()

function holdTicketPrs(): (lookup: PrLookup) => void {
  const held = deferred<PrLookup>()
  h.ado.ticketPrs = (key) => {
    h.ado.ticketPrsCalls.push(key)
    return held.promise
  }
  return (lookup) => {
    held.resolve(lookup)
  }
}

// A merged dev PR on a ticket whose live status is unknown to Jira, so the auto walk moves nothing.
function devMerged(status: string): Parameters<PrHarness['createService']>[0] {
  h.board = boardWith({ inProgress: { 'MDP-1': makeTicket('MDP-1', { status }) } })
  h.lookups.set('MDP-1', {
    prs: [pr('dev', 'completed', { mergeCommit: 'abc', mergedAt: MERGED_AT })],
    complete: true,
  })
  return { tracking: { 'MDP-1|dev|1': tracked('completed') } }
}

beforeEach(() => {
  h = new PrHarness()
})

describe('PrService check concurrency', () => {
  it('two checks at once share one pass', async () => {
    h.board = inProgress('MDP-1')
    const release = holdTicketPrs()
    const service = h.createService()

    const first = service.check()
    const second = service.check()
    release({ prs: [], complete: true })
    await first

    expect(second).toBe(first)
    expect(h.ado.ticketPrsCalls).toEqual(['MDP-1'])
  })

  it('drops the result of a client replaced mid-check', async () => {
    h.board = inProgress('MDP-1')
    const release = holdTicketPrs()
    const service = h.createService({ tracking: { 'MDP-1|main|1': tracked('active') } })
    const before = service.state()

    const running = service.check()
    service.configure({
      pullRequests: new FakePullRequests(),
      tracker: h.tracker,
      flow: FLOW,
      repoLabels: {},
    })
    release({ prs: [pr('main', 'completed')], complete: true })
    await running

    expect(service.state()).toBe(before)
    expect(service.lastCheck()).toBeNull()
    expect(h.notices).toEqual([])
  })
})

describe('PrService reviews and alerts', () => {
  it('hideReview marks the request seen', async () => {
    const service = h.createService({ reviews: { 'Backend|5': REQUEST } })

    await service.hideReview('Backend|5')

    expect(service.state().reviews['Backend|5']?.seen).toBe(true)
    expect(h.saved).toHaveLength(1)
  })

  it('check notices a review request that is new after the baseline', async () => {
    h.ado.requests = [REQUEST]
    const service = h.createService()

    await service.check()

    expect(h.notices).toEqual([
      {
        topic: 'pr',
        tone: 'info',
        event: { type: 'prReviewRequested', author: 'Lan', title: 'Add export' },
        target: { kind: 'url', url: 'https://ado.example/pr/5' },
        place: 'board',
      },
    ])
    expect(Object.keys(service.state().reviews)).toEqual(['Backend|5'])
  })

  it('check drops the comment alert of a ticket that left the board', async () => {
    h.board = inProgress('MDP-1')
    const alert = { count: 2, url: 'https://ado.example/pr', at: NOW.toISOString() }
    const service = h.createService({ commentAlerts: { 'MDP-1': alert, 'MDP-9': alert } })

    await service.check()

    expect(service.state().commentAlerts).toEqual({ 'MDP-1': alert })
  })
})

describe('PrService dev deploys', () => {
  it('auto walk stops before the last step until the deploy is deployed', async () => {
    const initial = devMerged('PR & Code Review')
    h.tracker.live.set('MDP-1', makeTicket('MDP-1', { status: 'PR & Code Review' }))
    h.ado.builds = [BUILD]
    const service = h.createService(initial)

    await service.check()
    expect(h.tracker.transitionCalls).toEqual([{ key: 'MDP-1', status: 'Deployed to Dev' }])
    expect(service.state().deploys['MDP-1']?.state).toBe('deploying')

    h.tracker.live.set('MDP-1', makeTicket('MDP-1', { status: 'Deployed to Dev' }))
    h.ado.builds = [{ ...BUILD, completed: true, succeeded: true }]
    await service.check()

    expect(h.tracker.transitionCalls.at(-1)).toEqual({ key: 'MDP-1', status: 'Ready to Test' })
    expect(h.notices.filter((notice) => notice.event.type === 'deployed')).toEqual([
      {
        topic: 'jira',
        tone: 'success',
        event: { type: 'deployed', key: 'MDP-1', moved: true },
        target: { kind: 'board', key: 'MDP-1' },
        place: 'board',
      },
    ])
  })

  it('a failed deploy that later succeeds gives one deployed notice', async () => {
    const initial = devMerged('Deployed to Dev')
    h.ado.builds = [{ ...BUILD, completed: true, succeeded: true }]
    const service = h.createService({
      ...initial,
      deploys: { 'MDP-1': { state: 'failed', mergedAt: MERGED_AT, failedBuild: BUILD } },
    })

    await service.check()
    await service.check()

    expect(h.notices).toEqual([
      {
        topic: 'jira',
        tone: 'success',
        event: { type: 'deployed', key: 'MDP-1', moved: false },
        target: { kind: 'board', key: 'MDP-1' },
        place: 'board',
      },
    ])
  })

  it('a failed deploy gives deployFailed opening the build', async () => {
    const initial = devMerged('Deployed to Dev')
    h.ado.builds = [{ ...BUILD, completed: true }]
    const service = h.createService(initial)

    await service.check()

    expect(h.notices).toEqual([
      {
        topic: 'jira',
        tone: 'error',
        event: { type: 'deployFailed', key: 'MDP-1', pipeline: 'api-dev' },
        target: { kind: 'url', url: 'https://ado.example/build/7' },
        place: 'board',
      },
    ])
    expect(service.state().deploys['MDP-1']?.failedBuild?.buildId).toBe(7)
  })
})
