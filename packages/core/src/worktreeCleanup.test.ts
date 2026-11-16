import { describe, expect, it } from 'vitest'
import {
  classifyWorktree,
  isCleanupKey,
  mergedTickets,
  minedTickets,
  worktreeKeyOf,
  type WorktreeFacts,
} from './worktreeCleanup.js'

const CLEAN: WorktreeFacts = {
  inspectFailed: false,
  sessionRunning: false,
  unpushedCommits: 0,
  isBroken: false,
  dirtyFiles: 0,
  localConfigDiffs: 0,
  inProgress: false,
  otherBranch: null,
  hasTrackedPrs: false,
  allPrsClosed: false,
  anyPrCompleted: false,
  branchMerged: true,
  mainPrMerged: false,
}

describe('classifyWorktree', () => {
  it('classifyWorktree_keeps_when_a_session_runs', () => {
    const all = { ...CLEAN, inspectFailed: true, sessionRunning: true, unpushedCommits: 2 }
    expect(classifyWorktree(all)).toEqual({
      verdict: 'keep',
      reasons: [{ code: 'inspectFailed' }],
    })
    expect(classifyWorktree({ ...all, inspectFailed: false })).toEqual({
      verdict: 'keep',
      reasons: [{ code: 'sessionRunning' }],
    })
  })

  it('classifyWorktree_keeps_unpushed_commits', () => {
    expect(classifyWorktree({ ...CLEAN, unpushedCommits: 2, dirtyFiles: 4 })).toEqual({
      verdict: 'keep',
      reasons: [{ code: 'unpushed', count: 2 }],
    })
  })

  it('classifyWorktree_ready_when_shipped_and_clean', () => {
    expect(classifyWorktree(CLEAN)).toEqual({ verdict: 'ready', reasons: [] })
    const prsMerged = { ...CLEAN, hasTrackedPrs: true, allPrsClosed: true, anyPrCompleted: true }
    expect(classifyWorktree({ ...prsMerged, branchMerged: false }).verdict).toBe('ready')
  })

  it('classifyWorktree_check_lists_every_reason', () => {
    const facts = {
      ...CLEAN,
      isBroken: true,
      dirtyFiles: 3,
      localConfigDiffs: 1,
      inProgress: true,
      otherBranch: 'MDP-9',
      branchMerged: false,
    }
    expect(classifyWorktree(facts)).toEqual({
      verdict: 'check',
      reasons: [
        { code: 'broken' },
        { code: 'dirty', count: 3 },
        { code: 'localConfig' },
        { code: 'inProgress' },
        { code: 'otherBranch', branch: 'MDP-9' },
        { code: 'notMerged' },
      ],
    })
  })

  it('classifyWorktree_abandoned_pr_is_not_shipped', () => {
    const abandoned = {
      ...CLEAN,
      hasTrackedPrs: true,
      allPrsClosed: true,
      anyPrCompleted: false,
      branchMerged: true,
    }
    expect(classifyWorktree(abandoned).reasons).toEqual([{ code: 'abandoned' }])
    const openPr = { ...CLEAN, hasTrackedPrs: true, mainPrMerged: true, branchMerged: false }
    expect(classifyWorktree(openPr).reasons).toEqual([{ code: 'mainMergedPrOpen' }])
    const noPrs = { ...CLEAN, allPrsClosed: true, branchMerged: false }
    expect(classifyWorktree(noPrs).reasons).toEqual([{ code: 'notMerged' }])
  })
})

describe('minedTickets', () => {
  it('minedTickets_drops_given_up_and_retried_keys', () => {
    const log =
      '2026-10-14 09:00:02 Mining MDP-1 first\n' +
      '2026-10-14 09:00:03 Mining MDP-2 second\n' +
      '2026-10-14 09:20:00   Giving up on MDP-2 after 3 failed attempts; x\n' +
      '2026-10-14 09:30:00 Mining MDP-2 again\n' +
      '2026-10-14 09:40:00 Mining MDP-3 third\r\n' +
      '2026-10-14 09:50:00   Giving up on MDP-3 after 3 failed attempts; x\r\n' +
      'x Mining MDP-4 fourth\n'
    expect([...minedTickets(log, '')].sort()).toEqual(['MDP-1', 'MDP-2', 'MDP-4'])
    expect([...minedTickets(log, '\uFEFFMDP-4 1\r\n')].sort()).toEqual(['MDP-1', 'MDP-2'])
  })
})

describe('mergedTickets', () => {
  it('mergedTickets_reads_keys_from_merge_subjects', () => {
    const subjects =
      'Merged PR 101: MDP-1 add export\n' +
      'Merged PR 102: MDP-22 MDP-23 fix both\r\n' +
      'Merged PR 103: main -> development\n'
    expect([...mergedTickets(subjects)].sort()).toEqual(['MDP-1', 'MDP-22', 'MDP-23'])
  })
})

describe('isCleanupKey', () => {
  it('isCleanupKey_rejects_paths', () => {
    for (const key of ['MDP-1', 'MDP-1-dev', 'AB2-10-x1']) {
      expect(isCleanupKey(key)).toBe(true)
    }
    for (const key of ['', '..', 'MDP-1/..', '..\\MDP-1', 'mdp-1', 'MDP-', 'MDP-1\n', 'MDP-1-']) {
      expect(isCleanupKey(key)).toBe(false)
    }
  })
})

describe('worktreeKeyOf', () => {
  it('reads the ticket from a worktree folder', () => {
    expect(worktreeKeyOf('C:\\P\\Backend\\.claude\\worktrees\\MDP-1')).toBe('MDP-1')
    expect(worktreeKeyOf('C:\\P\\Backend\\.claude\\worktrees\\MDP-1\\src')).toBe('MDP-1')
    expect(worktreeKeyOf('/p/b/.claude/worktrees/MDP-2/src')).toBe('MDP-2')
    expect(worktreeKeyOf('C:\\P\\Backend')).toBeNull()
  })
})
