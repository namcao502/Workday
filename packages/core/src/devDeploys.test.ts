import { describe, expect, it } from 'vitest'
import {
  mergesToWatch,
  repoState,
  shouldNotifyDeploy,
  ticketState,
  type DeployBuild,
  type DevDeploy,
  type DevMerge,
} from './devDeploys.js'
import type { PrTracking, TrackedPr } from './prTracking.js'

const MERGED_AT = '2026-10-20T22:18:45.000Z'
const MINUTE = 60_000
const BE = 'Backend-DotNet'
const FE = 'Portal-Angular'
const path = ['PR & Code Review', 'Deployed to Dev', 'Ready to Test']
const merge: DevMerge = { repository: BE, mergeCommit: 'c338c33b', mergedAt: MERGED_AT }

function at(minutes: number): string {
  return new Date(Date.parse(MERGED_AT) + minutes * MINUTE).toISOString()
}

function build(
  buildId: number,
  pipelineName: string,
  sourceVersion: string,
  queuedMinutes: number,
  options: { completed?: boolean; succeeded?: boolean; repository?: string } = {},
): DeployBuild {
  return {
    buildId,
    pipelineName,
    repository: options.repository ?? BE,
    sourceVersion,
    queuedAt: at(queuedMinutes),
    completed: options.completed ?? true,
    succeeded: options.succeeded ?? true,
    url: '',
  }
}

function deploy(state: DevDeploy['state'], mergedAt = MERGED_AT): DevDeploy {
  return { state, mergedAt, failedBuild: null }
}

describe('repoState', () => {
  it('is deployed when every triggered pipeline succeeded', () => {
    const builds = [build(1, 'Portal', 'c338c33b', 0), build(2, 'Ordering', 'c338c33b', 0)]

    expect(repoState(merge, builds, at(8))).toEqual(deploy('deployed'))
  })

  it('counts the merge commits run queued before the merge time', () => {
    const builds = [
      build(1, 'Portal', 'c338c33b', -1),
      build(2, 'Portal Angular', '984a6a52', -1, { succeeded: false, repository: FE }),
    ]

    expect(repoState(merge, builds, at(8))).toEqual(deploy('deployed'))
  })

  it('is failed until a later run of that pipeline succeeds', () => {
    const failed = build(1, 'Portal', 'c338c33b', 0, { succeeded: false })
    const builds = [failed, build(2, 'Ordering', 'c338c33b', 0)]

    const before = repoState(merge, builds, at(8))
    const after = repoState(merge, [...builds, build(3, 'Portal', '798d0628', 40)], at(50))

    expect(before).toEqual({ state: 'failed', mergedAt: MERGED_AT, failedBuild: failed })
    expect(after).toEqual(deploy('deployed'))
  })

  it('is deploying while a run is in progress', () => {
    const builds = [
      build(1, 'Portal', 'c338c33b', 0, { completed: false, succeeded: false }),
      build(2, 'Ordering', 'c338c33b', 0),
    ]

    expect(repoState(merge, builds, at(3)).state).toBe('deploying')
  })

  it('counts no pipeline as deployed after the grace', () => {
    expect(repoState(merge, [], at(5)).state).toBe('deploying')
    expect(repoState(merge, [], at(11)).state).toBe('deployed')
  })

  it('ignores other repos and earlier runs', () => {
    const builds = [
      build(1, 'Portal', 'c338c33b', 0),
      build(2, 'Portal Angular', 'c338c33b', 0, { succeeded: false, repository: FE }),
      build(3, 'Ordering', 'c338c33b', 0, { completed: false, succeeded: false }),
      build(4, 'Ordering', 'aaaa0000', -30),
    ]

    expect(repoState(merge, builds, at(3)).state).toBe('deploying')
  })
})

describe('ticketState', () => {
  it('lets failed beat deploying beat deployed', () => {
    const feMerge: DevMerge = { repository: FE, mergeCommit: '984a6a52', mergedAt: at(1) }
    const feRunning = build(2, 'Portal Angular', '984a6a52', 1, {
      completed: false,
      succeeded: false,
      repository: FE,
    })
    const deploying = [build(1, 'Portal', 'c338c33b', 0), feRunning]
    const failed = [build(1, 'Portal', 'c338c33b', 0, { succeeded: false }), feRunning]

    expect(ticketState([merge, feMerge], deploying, at(4))).toEqual(deploy('deploying', at(1)))
    expect(ticketState([merge, feMerge], failed, at(4)).state).toBe('failed')
  })
})

function tp(overrides: Partial<TrackedPr>): TrackedPr {
  return {
    status: 'completed',
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

describe('mergesToWatch', () => {
  it('watches only tickets with every dev PR merged and short of Ready to Test', () => {
    const now = at(60)
    const tracking: PrTracking = {
      'MDP-1|dev|10': tp({ mergeCommit: 'be1', mergedAt: MERGED_AT }),
      'MDP-1|dev|11': tp({ repository: FE, mergeCommit: 'fe1', mergedAt: at(1) }),
      'MDP-1|main|12': tp({ status: 'active' }),
      'MDP-2|dev|20': tp({ mergeCommit: 'be2', mergedAt: MERGED_AT }),
      'MDP-2|dev|21': tp({ status: 'active', repository: FE }),
      'MDP-3|dev|30': tp({ mergeCommit: 'be3', mergedAt: MERGED_AT }),
      'MDP-4|dev|40': tp({ mergeCommit: 'be4', mergedAt: at(60 - 8 * 24 * 60) }),
    }
    const statuses = {
      'MDP-1': 'PR & Code Review',
      'MDP-2': 'PR & Code Review',
      'MDP-3': 'Ready to Test',
      'MDP-4': 'Deployed to Dev',
    }

    const watched = mergesToWatch(tracking, statuses, path, now)

    expect(Object.keys(watched)).toEqual(['MDP-1'])
    expect(watched['MDP-1']?.map((m) => m.mergeCommit).sort()).toEqual(['be1', 'fe1'])
  })

  it('watches nothing when the path is not configured', () => {
    const tracking = { 'MDP-1|dev|10': tp({ mergeCommit: 'be1', mergedAt: MERGED_AT }) }
    expect(mergesToWatch(tracking, { 'MDP-1': 'PR & Code Review' }, [], at(1))).toEqual({})
  })
})

describe('shouldNotifyDeploy', () => {
  it('announces a first sight only for a recent merge, then on change', () => {
    const now = at(120)
    const deployed = deploy('deployed')
    const deploying = deploy('deploying')

    expect(shouldNotifyDeploy(null, deployed, now)).toBe(true)
    expect(shouldNotifyDeploy(null, deployed, at(2 * 24 * 60))).toBe(false)
    expect(shouldNotifyDeploy(null, deploying, now)).toBe(false)
    expect(shouldNotifyDeploy(deploying, deployed, now)).toBe(true)
    expect(shouldNotifyDeploy(deployed, deployed, now)).toBe(false)
    expect(shouldNotifyDeploy(deployed, deploying, now)).toBe(false)
  })
})
