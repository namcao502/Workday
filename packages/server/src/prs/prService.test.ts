import { NetworkFailure } from '@workday/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { boardWith, makeTicket } from '../testing/fakes.js'
import { inProgress, NOW, pr, PrHarness, tracked } from '../testing/prHarness.js'

let h = new PrHarness()

beforeEach(() => {
  h = new PrHarness()
})

describe('PrService.check (ported PrUpdateChecker)', () => {
  it('records only a baseline for a PR seen for the first time', async () => {
    h.board = inProgress('MDP-1')
    h.lookups.set('MDP-1', { prs: [pr('main', 'active', { commentCount: 3 })], complete: true })
    const service = h.createService()

    await service.check()

    expect(h.notices).toEqual([])
    expect(service.state().tracking['MDP-1|main|1']?.commentCount).toBe(3)
  })

  it('reports nothing and keeps no baseline after an incomplete pass', async () => {
    h.board = inProgress('MDP-1')
    h.lookups.set('MDP-1', { prs: [pr('main', 'completed')], complete: false })
    const service = h.createService({
      baselineDone: false,
      tracking: { 'MDP-1|main|1': tracked('active') },
    })

    await service.check()
    expect(service.state().baselineDone).toBe(false)
    h.lookups.set('MDP-1', { prs: [pr('main', 'completed')], complete: true })
    await service.check()

    expect(h.notices).toEqual([])
    expect(service.state().baselineDone).toBe(true)
  })

  it('leaves a work branch on the h.board to its own row', async () => {
    h.board = inProgress('MDP-1', 'MDP-1-phase-2')
    h.lookups.set('MDP-1', {
      prs: [
        pr('main', 'active', { pullRequestId: 10 }),
        pr('fix', 'active', { pullRequestId: 11 }),
        pr('phase-2', 'active', { pullRequestId: 12 }),
        pr('phase-2-dev', 'active', { pullRequestId: 13 }),
      ],
      complete: true,
    })
    h.lookups.set('MDP-1-phase-2', {
      prs: [
        pr('main', 'active', { pullRequestId: 12 }),
        pr('dev', 'active', { pullRequestId: 13 }),
      ],
      complete: true,
    })
    const service = h.createService()

    await service.check()

    expect(Object.keys(service.state().tracking).sort()).toEqual([
      'MDP-1-phase-2|dev|13',
      'MDP-1-phase-2|main|12',
      'MDP-1|fix|11',
      'MDP-1|main|10',
    ])
  })

  it('stops the pass at a network failure and records a failed check', async () => {
    h.board = inProgress('MDP-1', 'MDP-2')
    h.lookups.set('MDP-1', new NetworkFailure('offline'))
    const service = h.createService({ baselineDone: false })

    await service.check()

    expect(h.ado.ticketPrsCalls).toEqual(['MDP-1'])
    expect(service.lastCheck()).toEqual({ at: NOW.toISOString(), ok: false })
    expect(service.state().baselineDone).toBe(false)
  })

  it('skips a ticket that fails otherwise and reads the rest', async () => {
    h.board = inProgress('MDP-1', 'MDP-2')
    h.lookups.set('MDP-1', new Error('boom'))
    h.lookups.set('MDP-2', { prs: [pr('main', 'completed')], complete: true })
    const service = h.createService({ tracking: { 'MDP-2|main|1': tracked('active') } })

    await service.check()

    expect(h.ado.ticketPrsCalls).toEqual(['MDP-1', 'MDP-2'])
    expect(h.notices.map((notice) => notice.event)).toEqual([
      { type: 'prMerged', key: 'MDP-2', branch: 'BE main' },
    ])
  })

  it('skips a done ticket whose PRs all closed', async () => {
    h.board = boardWith({ done: { 'MDP-1': makeTicket('MDP-1'), 'MDP-2': makeTicket('MDP-2') } })
    const service = h.createService({
      tracking: { 'MDP-1|main|1': tracked('completed'), 'MDP-2|main|1': tracked('active') },
    })

    await service.check()

    expect(h.ado.ticketPrsCalls).toEqual(['MDP-2'])
  })
})

describe('PrService notices', () => {
  it('check notifies a merge, new comments and a failed build after the baseline', async () => {
    h.board = inProgress('MDP-1')
    h.lookups.set('MDP-1', {
      prs: [
        pr('main', 'completed'),
        pr('fix', 'active', {
          pullRequestId: 2,
          commentCount: 2,
          build: 'failed',
          targetBranch: 'MDP-9',
        }),
      ],
      complete: true,
    })
    const service = h.createService({
      tracking: { 'MDP-1|main|1': tracked('active'), 'MDP-1|fix|2': tracked('active') },
    })

    await service.check()

    expect(h.notices).toEqual([
      {
        topic: 'pr',
        tone: 'success',
        event: { type: 'prMerged', key: 'MDP-1', branch: 'BE main' },
        target: { kind: 'board', key: 'MDP-1' },
        place: 'board',
      },
      {
        topic: 'pr',
        tone: 'info',
        event: { type: 'prComments', key: 'MDP-1', branch: 'BE fix -> MDP-9', count: 2 },
        target: { kind: 'url', url: 'https://ado.example/pr/fix' },
        place: 'pr-comments:MDP-1',
      },
      {
        topic: 'pr',
        tone: 'error',
        event: { type: 'prBuildFailed', key: 'MDP-1', branch: 'BE fix -> MDP-9' },
        target: { kind: 'url', url: 'https://ado.example/pr/fix' },
        place: 'board',
      },
    ])
    expect(h.saved).toHaveLength(1)
    expect(h.events).toContainEqual({ type: 'work.changed' })
  })

  it('check adds comment alerts and markCommentsSeen clears them and reads the notices', async () => {
    h.board = inProgress('MDP-1')
    h.lookups.set('MDP-1', { prs: [pr('main', 'active', { commentCount: 3 })], complete: true })
    const service = h.createService({ tracking: { 'MDP-1|main|1': tracked('active') } })

    await service.check()
    expect(service.state().commentAlerts).toEqual({
      'MDP-1': { count: 3, url: 'https://ado.example/pr/main', at: NOW.toISOString() },
    })
    await service.markCommentsSeen('MDP-1')

    expect(service.state().commentAlerts).toEqual({})
    expect(h.readPlaces).toEqual(['pr-comments:MDP-1'])
  })

  it('check sends devMerged once every dev PR merged', async () => {
    h.board = boardWith({
      inProgress: { 'MDP-1': makeTicket('MDP-1', { status: 'PR & Code Review' }) },
    })
    const service = h.createService({
      tracking: {
        'MDP-1|dev|1': tracked('active'),
        'MDP-1|dev|2': tracked('active', { repository: 'Frontend' }),
      },
    })
    const backendDev = pr('dev', 'completed')
    const frontendDev = pr('dev', 'active', { pullRequestId: 2, repository: 'Frontend' })
    h.lookups.set('MDP-1', { prs: [backendDev, frontendDev], complete: true })

    await service.check()
    expect(h.notices.filter((notice) => notice.event.type === 'devMerged')).toEqual([])
    h.lookups.set('MDP-1', {
      prs: [backendDev, { ...frontendDev, status: 'completed' }],
      complete: true,
    })
    await service.check()
    await service.check()

    expect(h.notices.filter((notice) => notice.event.type === 'devMerged')).toEqual([
      {
        topic: 'jira',
        tone: 'info',
        event: { type: 'devMerged', key: 'MDP-1' },
        target: { kind: 'board', key: 'MDP-1' },
        place: 'board',
      },
    ])
  })

  it('check does nothing without an Azure DevOps client', async () => {
    h.board = inProgress('MDP-1')
    const service = h.createService({}, null)

    await service.check()

    expect(h.ado.ticketPrsCalls).toEqual([])
    expect(service.lastCheck()).toBeNull()
    expect(h.saved).toEqual([])
  })
})
