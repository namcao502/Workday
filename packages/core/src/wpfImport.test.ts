import { describe, expect, it } from 'vitest'
import type { BoardState } from './board.js'
import type { TeamsChannelIndex } from './teamsPostIndex.js'
import type { QueueEntry } from './timesheetQueue.js'
import {
  mergeBoard,
  mergeDevRepoPath,
  mergeHiddenSuggestions,
  mergePostIndex,
  mergeQueue,
  mergeTeamsState,
  mergeWorkspace,
  parseWpfJson,
  type WpfTeamsState,
  type WpfWorkspaceState,
} from './wpfImport.js'
import { MAX_PEOPLE } from './teamsCompose.js'
import { MAX_RECENT_FOLDERS } from './workspaceTabs.js'

const EMPTY_TEAMS: WpfTeamsState = {
  seenAt: {},
  notifiedAt: {},
  postedAt: {},
  baselineDone: false,
  people: [],
}
const EMPTY_WORKSPACE: WpfWorkspaceState = { tabs: [], sessionIds: {}, recentFolders: [] }
const EMPTY_BOARD: BoardState = { new: {}, inProgress: {}, done: {}, dismissed: {}, seenKeys: null }
const GUID = '123e4567-e89b-12d3-a456-426614174000'

function channel(
  posts: TeamsChannelIndex['posts'],
  syncedAt: string | null = null,
): TeamsChannelIndex {
  return { syncedAt, deepScanned: false, deepScanPages: 0, deepScanLink: null, posts }
}

describe('parseWpfJson', () => {
  it('strips a BOM and returns null for broken text', () => {
    expect(parseWpfJson('\uFEFF{"a":1}')).toEqual({ a: 1 })
    expect(parseWpfJson('{oops')).toBeNull()
  })
})

describe('mergeQueue', () => {
  const existing: QueueEntry[] = [{ date: '2026-01-02', tickets: ['AB-1'], minutes: null }]
  it('adds days Workday lacks and drops malformed entries', () => {
    const raw = {
      entries: [
        { date: '2026-01-03', tickets: ['AB-2'] },
        { date: 5 },
        { date: '2026-01-04', tickets: ['bad'] },
        null,
      ],
    }
    const merged = mergeQueue(existing, raw)
    expect(merged.value).toEqual([
      ...existing,
      { date: '2026-01-03', tickets: ['AB-2'], minutes: null },
    ])
    expect(merged.count).toEqual({ added: 1, kept: 0 })
  })
  it('keeps the Workday entry of a day both have', () => {
    const merged = mergeQueue(existing, { entries: [{ date: '2026-01-02', tickets: ['AB-9'] }] })
    expect(merged.value).toEqual(existing)
    expect(merged.count).toEqual({ added: 0, kept: 1 })
  })
})

describe('mergePostIndex', () => {
  const mine = { rootId: 'r1', sentAt: '2026-01-01T00:00:00.000Z', mine: true }
  const wpfPost = { rootId: 'r2', sentAt: '2026-01-02T00:00:00.000Z', mine: false }
  it('takes a channel Workday lacks whole', () => {
    const raw = { c1: channel({ 'AB-1': wpfPost }, '2026-01-02T00:00:00.000Z') }
    const merged = mergePostIndex({}, raw)
    expect(merged.value).toEqual(raw)
    expect(merged.count).toEqual({ added: 1, kept: 0 })
  })
  it('unions posts of a shared channel and Workday wins on a key', () => {
    const existing = { c1: channel({ 'AB-1': mine }) }
    const raw = { c1: channel({ 'AB-1': wpfPost, 'AB-2': wpfPost }) }
    const merged = mergePostIndex(existing, raw)
    expect(merged.value['c1']?.posts).toEqual({ 'AB-1': mine, 'AB-2': wpfPost })
    expect(merged.count).toEqual({ added: 1, kept: 1 })
  })
})

describe('mergeTeamsState', () => {
  it('takes the later time per key and normalizes it to ISO UTC', () => {
    const existing = {
      ...EMPTY_TEAMS,
      seenAt: { a: '2026-01-02T00:00:00.000Z', b: '2026-01-05T00:00:00.000Z' },
    }
    const settings = {
      teamsSeenAt: { a: '2026-01-02T07:00:00+07:00', b: '2026-01-06T00:00:00+00:00', c: 'nope' },
      teamsNotifiedAt: { n: '2026-02-01T00:00:00Z' },
    }
    const merged = mergeTeamsState(existing, settings)
    expect(merged.value.seenAt).toEqual({
      a: '2026-01-02T00:00:00.000Z',
      b: '2026-01-06T00:00:00.000Z',
    })
    expect(merged.value.notifiedAt).toEqual({ n: '2026-02-01T00:00:00.000Z' })
    expect(merged.counts.seenAt).toEqual({ added: 1, kept: 1 })
  })
  it('postedAt drops db-review keys', () => {
    const settings = {
      teamsPostedAt: { 'AB-1': '2026-01-01T00:00:00Z', 'AB-1|db-review': '2026-01-01T00:00:00Z' },
    }
    expect(mergeTeamsState(EMPTY_TEAMS, settings).value.postedAt).toEqual({
      'AB-1': '2026-01-01T00:00:00.000Z',
    })
  })
  it('postedAt keeps the Workday value of a key', () => {
    const existing = { ...EMPTY_TEAMS, postedAt: { 'AB-1': '2025-01-01T00:00:00.000Z' } }
    const merged = mergeTeamsState(existing, { teamsPostedAt: { 'AB-1': '2026-01-01T00:00:00Z' } })
    expect(merged.value.postedAt).toEqual(existing.postedAt)
    expect(merged.counts.postedAt).toEqual({ added: 0, kept: 1 })
  })
  it('people: Workday first, no duplicate mri, cut at MAX_PEOPLE', () => {
    const own = { mri: 'm1', displayName: 'Own' }
    const merged = mergeTeamsState(
      { ...EMPTY_TEAMS, people: [own] },
      {
        teamsPeople: [
          { mri: 'm1', displayName: 'Dup' },
          { mri: 'm2', displayName: 'Two' },
        ],
      },
    )
    expect(merged.value.people).toEqual([own, { mri: 'm2', displayName: 'Two' }])
    expect(merged.counts.people).toEqual({ added: 1, kept: 1 })
    const many = Array.from({ length: MAX_PEOPLE + 5 }, (_, i) => ({
      mri: `m${String(i)}`,
      displayName: 'x',
    }))
    expect(mergeTeamsState(EMPTY_TEAMS, { teamsPeople: many }).value.people).toHaveLength(
      MAX_PEOPLE,
    )
  })
  it('baselineDone is an OR', () => {
    expect(
      mergeTeamsState(EMPTY_TEAMS, { teamsAttentionBaselineDone: true }).value.baselineDone,
    ).toBe(true)
    expect(mergeTeamsState({ ...EMPTY_TEAMS, baselineDone: true }, {}).value.baselineDone).toBe(
      true,
    )
  })
})

describe('mergeHiddenSuggestions', () => {
  it('unions without duplicates', () => {
    const merged = mergeHiddenSuggestions(['AB-1'], {
      hiddenTicketSuggestions: ['AB-1', 'AB-2', 7],
    })
    expect(merged.value).toEqual(['AB-1', 'AB-2'])
    expect(merged.count).toEqual({ added: 1, kept: 1 })
  })
})

describe('mergeWorkspace', () => {
  const settings = {
    openTicketTabs: ['AB-1', 'bad'],
    ticketClaudeTabs: { 'AB-1': ['AB-1~2', 'zzz'] },
    terminalTabs: [
      { name: 'claude', directory: 'C:\\a' },
      { name: 'evil', directory: 'x' },
    ],
    terminalClaudeTabs: { claude: ['claude~2'] },
  }
  it('tabs are imported only into an empty workspace', () => {
    const merged = mergeWorkspace(EMPTY_WORKSPACE, settings)
    expect(merged.value.tabs).toEqual([
      { id: 'AB-1', kind: 'ticket', folder: null, sessions: ['AB-1', 'AB-1~2'] },
      { id: 'claude', kind: 'terminal', folder: 'C:\\a', sessions: ['claude', 'claude~2'] },
    ])
    expect(merged.counts.tabs).toEqual({ added: 2, kept: 0 })
    const own = { id: 'AB-9', kind: 'ticket' as const, folder: null, sessions: ['AB-9'] }
    const kept = mergeWorkspace({ ...EMPTY_WORKSPACE, tabs: [own] }, settings)
    expect(kept.value.tabs).toEqual([own])
    expect(kept.counts.tabs).toEqual({ added: 0, kept: 2 })
  })
  it('sessionIds union with Workday winning', () => {
    const existing = { ...EMPTY_WORKSPACE, sessionIds: { 'a|c': GUID } }
    const other = '223e4567-e89b-12d3-a456-426614174000'
    const merged = mergeWorkspace(existing, {
      claudeSessionIds: { 'a|c': other, 'b|c': other, bad: other, 'd|c': 'not-a-guid' },
    })
    expect(merged.value.sessionIds).toEqual({ 'a|c': GUID, 'b|c': other })
    expect(merged.counts.sessionIds).toEqual({ added: 1, kept: 1 })
  })
  it('recent folders: Workday first, deduped, cut at the maximum', () => {
    const wpf = Array.from({ length: MAX_RECENT_FOLDERS + 2 }, (_, i) => `f${String(i)}`)
    const merged = mergeWorkspace(
      { ...EMPTY_WORKSPACE, recentFolders: ['f1'] },
      { recentClaudeDirectories: wpf },
    )
    expect(merged.value.recentFolders).toEqual(['f1', 'f0', 'f2', 'f3', 'f4'])
    expect(merged.counts.recentFolders).toEqual({ added: 4, kept: 1 })
  })
})

describe('mergeDevRepoPath', () => {
  it('fills only a null path', () => {
    const settings = { config: { DEV_REPO_PATH: '/repo' } }
    expect(mergeDevRepoPath(null, settings)).toEqual({
      value: '/repo',
      count: { added: 1, kept: 0 },
    })
    expect(mergeDevRepoPath('/own', settings)).toEqual({
      value: '/own',
      count: { added: 0, kept: 1 },
    })
  })
})

describe('mergeBoard', () => {
  const wpfTicket = { Key: 'AB-1', Summary: 'Hello', Status: 'Open', TimeSpentSeconds: 60 }
  const files = {
    pending: { x: wpfTicket },
    started: { y: { Key: 'AB-2' } },
    done: { z: { Key: 'AB-3' } },
    dismissed: { d: { Ticket: { Key: 'AB-4' }, Origin: 2 } },
    seen: ['AB-1', 'AB-2'],
  }
  it('maps WPF tickets onto the board sections', () => {
    const merged = mergeBoard(EMPTY_BOARD, files)
    expect(merged.value.new['AB-1']).toMatchObject({
      key: 'AB-1',
      summary: 'Hello',
      status: 'Open',
      timeSpentSeconds: 60,
      eta: null,
    })
    expect(Object.keys(merged.value.inProgress)).toEqual(['AB-2'])
    expect(Object.keys(merged.value.done)).toEqual(['AB-3'])
    expect(merged.value.dismissed['AB-4']?.origin).toBe('done')
    expect(merged.value.seenKeys).toEqual(['AB-1', 'AB-2'])
    expect(merged.counts.new).toEqual({ added: 1, kept: 0 })
  })
  it('keeps a ticket already on the Workday board and its seen keys', () => {
    const ticket = mergeBoard(EMPTY_BOARD, files).value.new['AB-1']
    if (ticket === undefined) {
      throw new Error('fixture ticket missing')
    }
    const own = {
      ...EMPTY_BOARD,
      done: { 'AB-1': { ...ticket, summary: 'Mine' } },
      seenKeys: ['AB-9'],
    }
    const merged = mergeBoard(own, files)
    expect(merged.value.done['AB-1']?.summary).toBe('Mine')
    expect(merged.value.new).toEqual({})
    expect(merged.counts.new).toEqual({ added: 0, kept: 1 })
    expect(merged.value.seenKeys).toEqual(['AB-9', 'AB-1', 'AB-2'])
  })
})

describe('idempotence and malformed input', () => {
  it('a second merge of the same input changes nothing', () => {
    const settings = {
      teamsSeenAt: { a: '2026-01-02T00:00:00+07:00' },
      teamsPostedAt: { 'AB-1': '2026-01-01T00:00:00Z' },
      teamsPeople: [{ mri: 'm', displayName: 'N' }],
      teamsAttentionBaselineDone: true,
      openTicketTabs: ['AB-1'],
      recentClaudeDirectories: ['f'],
    }
    const first = mergeTeamsState(EMPTY_TEAMS, settings)
    const second = mergeTeamsState(first.value, settings)
    expect(second.value).toEqual(first.value)
    expect(second.counts.seenAt.added).toBe(0)
    const tabs = mergeWorkspace(EMPTY_WORKSPACE, settings)
    expect(mergeWorkspace(tabs.value, settings).value).toEqual(tabs.value)
    const queue = mergeQueue([], { entries: [{ date: '2026-01-03', tickets: ['AB-2'] }] })
    expect(
      mergeQueue(queue.value, { entries: [{ date: '2026-01-03', tickets: ['AB-2'] }] }).count.added,
    ).toBe(0)
  })
  it('a malformed WPF file yields no entries, never throws', () => {
    for (const raw of [null, 'text', 5, [], { entries: 'x' }, { entries: [1, null, {}] }]) {
      expect(mergeQueue([], raw).value).toEqual([])
      expect(mergePostIndex({}, raw).value).toEqual({})
      expect(mergeTeamsState(EMPTY_TEAMS, raw).value).toEqual(EMPTY_TEAMS)
      expect(mergeWorkspace(EMPTY_WORKSPACE, raw).value).toEqual(EMPTY_WORKSPACE)
      expect(mergeHiddenSuggestions([], raw).value).toEqual([])
      expect(mergeDevRepoPath(null, raw).value).toBeNull()
    }
    const broken = { pending: 'x', started: null, done: [1], dismissed: { a: 5 }, seen: 'no' }
    expect(mergeBoard(EMPTY_BOARD, broken).value).toEqual(EMPTY_BOARD)
  })
})
