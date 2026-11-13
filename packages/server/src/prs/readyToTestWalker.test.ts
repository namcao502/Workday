import type { DevDeploy, Ticket } from '@workday/core'
import { beforeEach, describe, expect, it } from 'vitest'
import type { NoticeInput } from '../notices/noticeService.js'
import { deferred, FakeTracker, makeTicket } from '../testing/fakes.js'
import { ReadyToTestWalker } from './readyToTestWalker.js'

const PATH = ['PR & Code Review', 'Deployed to Dev', 'Ready to Test']
const DEPLOYING: DevDeploy = {
  state: 'deploying',
  mergedAt: '2026-11-13T09:00:00Z',
  failedBuild: null,
}

let tracker = new FakeTracker()
let notices: NoticeInput[] = []
let refreshed: string[] = []

function createWalker(): ReadyToTestWalker {
  return new ReadyToTestWalker({
    settings: () => ({ tracker, path: PATH }),
    notices: {
      add: (input) => {
        notices.push(input)
        return Promise.resolve()
      },
    },
    board: {
      refreshTicket: (key) => {
        refreshed.push(key)
        return Promise.resolve()
      },
    },
    logError: () => undefined,
  })
}

beforeEach(() => {
  tracker = new FakeTracker()
  notices = []
  refreshed = []
})

describe('ReadyToTestWalker.walk', () => {
  it('readyToTest walks the live status, refreshes the ticket and reports moved', async () => {
    tracker.live.set('MDP-1', makeTicket('MDP-1', { status: 'deployed to dev' }))
    const walker = createWalker()

    const outcome = await walker.walk('MDP-1')

    expect(outcome).toEqual({ status: 'moved' })
    expect(tracker.transitionCalls).toEqual([{ key: 'MDP-1', status: 'Ready to Test' }])
    expect(refreshed).toEqual(['MDP-1'])
    expect(notices.map((notice) => notice.event)).toEqual([
      { type: 'movedToReadyToTest', key: 'MDP-1' },
    ])
  })

  it('readyToTest stops at a missing transition and reports failed with the step', async () => {
    tracker.live.set('MDP-1', makeTicket('MDP-1', { status: 'PR & Code Review' }))
    tracker.transitionResult = false
    const walker = createWalker()

    const outcome = await walker.walk('MDP-1')

    expect(outcome).toEqual({ status: 'failed', step: 'Deployed to Dev' })
    expect(tracker.transitionCalls).toHaveLength(1)
    expect(refreshed).toEqual(['MDP-1'])
    expect(notices.map((notice) => notice.event)).toEqual([
      { type: 'transitionFailed', key: 'MDP-1', status: 'Deployed to Dev' },
    ])
  })

  it('readyToTest notices the step that threw, refreshes and rethrows', async () => {
    tracker.live.set('MDP-1', makeTicket('MDP-1', { status: 'PR & Code Review' }))
    tracker.transition = () => Promise.reject(new Error('Jira down'))
    const walker = createWalker()

    await expect(walker.walk('MDP-1')).rejects.toThrow('Jira down')

    expect(refreshed).toEqual(['MDP-1'])
    expect(notices.map((notice) => notice.event)).toEqual([
      { type: 'transitionFailed', key: 'MDP-1', status: 'Deployed to Dev' },
    ])
  })

  it('readyToTest twice at once runs once and answers busy', async () => {
    const held = deferred<Ticket | null>()
    tracker.getTicket = () => held.promise
    const walker = createWalker()

    const first = walker.walk('MDP-1')
    const second = await walker.walk('MDP-1')
    held.resolve(makeTicket('MDP-1', { status: 'Deployed to Dev' }))

    expect(second).toEqual({ status: 'busy' })
    expect(await first).toEqual({ status: 'moved' })
    expect(tracker.transitionCalls).toHaveLength(1)
  })
})

describe('ReadyToTestWalker.auto', () => {
  it('auto walk stops before the last step until the deploy is deployed', async () => {
    tracker.live.set('MDP-1', makeTicket('MDP-1', { status: 'PR & Code Review' }))
    const walker = createWalker()

    const moved = await walker.auto('MDP-1', DEPLOYING)
    tracker.live.set('MDP-1', makeTicket('MDP-1', { status: 'Deployed to Dev' }))
    const movedWhenDeployed = await walker.auto('MDP-1', { ...DEPLOYING, state: 'deployed' })

    expect(moved).toBe(false)
    expect(movedWhenDeployed).toBe(true)
    expect(tracker.transitionCalls.map((call) => call.status)).toEqual([
      'Deployed to Dev',
      'Ready to Test',
    ])
    expect(refreshed).toEqual(['MDP-1', 'MDP-1'])
  })

  it('auto walk failure is noticed once per key and step', async () => {
    tracker.live.set('MDP-1', makeTicket('MDP-1', { status: 'PR & Code Review' }))
    tracker.transitionResult = false
    const walker = createWalker()

    await walker.auto('MDP-1', DEPLOYING)
    await walker.auto('MDP-1', DEPLOYING)

    expect(tracker.transitionCalls).toHaveLength(2)
    expect(notices.map((notice) => notice.event)).toEqual([
      { type: 'transitionFailed', key: 'MDP-1', status: 'Deployed to Dev' },
    ])
  })
})
