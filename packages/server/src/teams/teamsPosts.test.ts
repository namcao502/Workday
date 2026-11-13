import type { TeamsPostIndex } from '@workday/core'
import { describe, expect, it } from 'vitest'
import { FakeTeams, ME, NOON, pageOf, teamsMessage } from '../testing/fakeTeams.js'
import { DEEP_SCAN_PAGE_LIMIT, MAX_PAGES_PER_READ, TeamsPostSync } from './teamsPosts.js'

const MONTH_MINUTES = 30 * 24 * 60

function rig(initial: TeamsPostIndex = {}): {
  sync: TeamsPostSync
  saves: TeamsPostIndex[]
  clock: { now: Date }
} {
  const saves: TeamsPostIndex[] = []
  const clock = { now: NOON }
  const sync = new TeamsPostSync({
    initial,
    save: (index) => {
      saves.push(index)
      return Promise.resolve()
    },
    now: () => clock.now,
    log: () => undefined,
  })
  return { sync, saves, clock }
}

function post(
  id: string,
  subject: string,
  minutes = 0,
  senderId = ME,
): ReturnType<typeof teamsMessage> {
  return teamsMessage(id, { subject, minutes, senderId })
}

describe('TeamsPostSync', () => {
  it('reads at most 15 pages per read and resumes the deep scan from its cursor', async () => {
    const teams = new FakeTeams()
    teams.pages.set('c1|', pageOf('link1', post('a', 'MDP-5 x')))
    for (let page = 1; page <= 60; page++) {
      teams.pages.set(
        `c1|link${String(page)}`,
        pageOf(`link${String(page + 1)}`, post(`m${String(page)}`, 'MDP-5 x')),
      )
    }
    const { sync, clock } = rig()

    await sync.syncChannels(teams, ['c1'], ME)
    const afterFirst = sync.get('c1')
    clock.now = new Date(NOON.getTime() + 30_000)
    await sync.syncChannels(teams, ['c1'], ME)
    clock.now = new Date(NOON.getTime() + 50_000)
    await sync.syncChannels(teams, ['c1'], ME)

    expect(MAX_PAGES_PER_READ).toBe(15)
    expect(afterFirst.deepScanPages).toBe(14)
    expect(afterFirst.deepScanLink).toBe('link15')
    expect(teams.pageCalls[15]).toEqual(['c1', 'link15'])
    expect(teams.pageCalls).toHaveLength(1 + DEEP_SCAN_PAGE_LIMIT)
    expect(sync.get('c1').deepScanned).toBe(true)
  })

  it('saves the index after every page', async () => {
    const teams = new FakeTeams()
    teams.pages.set('c1|', pageOf('link1', post('a', 'MDP-5 x')))
    teams.pages.set('c1|link1', pageOf('link2', post('b', 'MDP-6 x')))
    teams.pages.set('c1|link2', pageOf(null, post('c', 'MDP-7 x')))
    const { sync, saves } = rig()

    await sync.syncChannels(teams, ['c1'], ME)

    const pagesSeen = saves.map((index) => Object.keys(index['c1']?.posts ?? {}).length)
    expect(pagesSeen).toContain(1)
    expect(pagesSeen).toContain(2)
    expect(saves.at(-1)?.['c1']?.deepScanned).toBe(true)
  })

  it('does not stop before the third page', async () => {
    const teams = new FakeTeams()
    const twoHoursAgo = new Date(NOON.getTime() - 2 * 3_600_000).toISOString()
    const { sync } = rig({
      c1: {
        syncedAt: twoHoursAgo,
        deepScanned: true,
        deepScanPages: 0,
        deepScanLink: null,
        posts: {},
      },
    })
    teams.pages.set('c1|', pageOf('p2', post('edited', 'MDP-7 x', -MONTH_MINUTES)))
    teams.pages.set('c1|p2', pageOf('p3', post('new', 'MDP-1 subject', -60, 'someone')))
    teams.pages.set('c1|p3', pageOf('p4', post('older', 'MDP-8 x', -MONTH_MINUTES)))
    teams.pages.set('c1|p4', pageOf('p5', post('oldest', 'MDP-9 x', -2 * MONTH_MINUTES)))

    await sync.syncChannels(teams, ['c1'], ME)

    expect(teams.pageCalls).toEqual([
      ['c1', null],
      ['c1', 'p2'],
      ['c1', 'p3'],
    ])
    expect(sync.get('c1').posts['MDP-1']?.rootId).toBe('new')
    expect(sync.get('c1').syncedAt).toBe(NOON.toISOString())
  })

  it('does not sync again within 60 seconds', async () => {
    const teams = new FakeTeams()
    teams.pages.set('c1|', pageOf(null, post('a', 'MDP-5 x')))
    const { sync, clock } = rig()

    await sync.syncChannels(teams, ['c1'], ME)
    clock.now = new Date(NOON.getTime() + 59_000)
    await sync.syncChannels(teams, ['c1'], ME)
    const within = teams.pageCalls.length
    clock.now = new Date(NOON.getTime() + 61_000)
    await sync.syncChannels(teams, ['c1'], ME)

    expect(within).toBe(1)
    expect(teams.pageCalls).toHaveLength(2)
  })

  it('skips another watched channel it cannot read, but not the first', async () => {
    const teams = new FakeTeams()
    teams.forbidden.add('c2')
    const { sync } = rig()

    const unreadable = await sync.syncChannels(teams, ['c1', 'c2'], ME)

    expect(unreadable).toEqual(['c2'])
    await expect(sync.syncChannels(teams, ['c2'], ME)).rejects.toThrow()
  })

  it('starts the deep scan over when the saved link is refused', async () => {
    const teams = new FakeTeams()
    teams.forbidden.add('c1')
    const { sync } = rig({
      c1: {
        syncedAt: NOON.toISOString(),
        deepScanned: false,
        deepScanPages: 5,
        deepScanLink: 'old',
        posts: {},
      },
    })

    await sync.syncChannels(teams, ['c1'], ME)

    expect(sync.get('c1').deepScanLink).toBeNull()
    expect(sync.get('c1').deepScanPages).toBe(0)
  })
})
