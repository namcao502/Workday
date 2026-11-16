import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PromptOutcome } from '../teams/teamsHandOff.js'
import { boardWith, deferred, makeTicket } from '../testing/fakes.js'
import { BugFixer } from './fixBug.js'
import { worktreePathOf } from './ticketWorktrees.js'

function rig(
  options: { prompt?: PromptOutcome; worktree?: boolean; bugInNew?: boolean; hold?: boolean } = {},
) {
  const { prompt = 'sent', worktree = true, bugInNew = true, hold = false } = options
  const dev = mkdtempSync(join(tmpdir(), 'workday-fix-'))
  if (worktree) {
    mkdirSync(worktreePathOf(dev, 'MDP-1'), { recursive: true })
  }
  const bug = makeTicket('MDP-9', { issueType: 'Bug', linkedKeys: ['MDP-1'] })
  const board = boardWith({
    inProgress: bugInNew
      ? { 'MDP-1': makeTicket('MDP-1'), 'MDP-8': makeTicket('MDP-8') }
      : { 'MDP-1': makeTicket('MDP-1'), 'MDP-9': bug },
    new: bugInNew ? { 'MDP-9': bug } : {},
  })
  const calls: string[] = []
  const gate = deferred<undefined>()
  const fixer = new BugFixer({
    board: {
      snapshot: () => board,
      start: (key) => {
        calls.push(`start ${key}`)
        return Promise.resolve()
      },
    },
    workspace: {
      openTicketTab: async (key) => {
        calls.push(`open ${key}`)
        await gate.promise
      },
      prompt: (session, text) => {
        calls.push(`prompt ${session}: ${text}`)
        return prompt
      },
    },
    timesheet: {
      queueToday: (keys) => {
        calls.push(`queue ${keys.join(',')}`)
        return Promise.resolve({ ok: true })
      },
    },
    devRepoPath: () => dev,
    logError: () => undefined,
  })
  if (!hold) {
    gate.resolve(undefined)
  }
  return { fixer, calls, gate }
}

describe('BugFixer.fix', () => {
  it('fix_sends_jira_fetch_bug_to_the_parent_session_then_starts_the_bug', async () => {
    const h = rig()

    const outcome = await h.fixer.fix('MDP-9')

    expect(outcome).toEqual({ ok: true })
    expect(h.calls).toEqual([
      'open MDP-1',
      'prompt MDP-1: jira-fetch-bug MDP-9',
      'start MDP-9',
      'queue MDP-1',
    ])
  })

  it('a bug already started is not started again but its parent is queued', async () => {
    const h = rig({ bugInNew: false })

    await h.fixer.fix('MDP-9')

    expect(h.calls).toEqual(['open MDP-1', 'prompt MDP-1: jira-fetch-bug MDP-9', 'queue MDP-1'])
  })

  it('fix_changes_nothing_when_the_prompt_fails', async () => {
    const h = rig({ prompt: 'waiting' })

    const outcome = await h.fixer.fix('MDP-9')

    expect(outcome).toEqual({ ok: false, error: { code: 'claudeWaiting' } })
    expect(h.calls).toEqual(['open MDP-1', 'prompt MDP-1: jira-fetch-bug MDP-9'])
  })

  it('fix_reports_parentWorktreeMissing', async () => {
    const h = rig({ worktree: false })

    const outcome = await h.fixer.fix('MDP-9')

    expect(outcome).toEqual({
      ok: false,
      error: { code: 'parentWorktreeMissing', parentKey: 'MDP-1' },
    })
    expect(h.calls).toEqual(['open MDP-1'])
  })

  it('fix_rejects_a_key_that_is_not_a_bug', async () => {
    const h = rig()

    expect(await h.fixer.fix('MDP-8')).toEqual({ ok: false, error: { code: 'notABug' } })
    expect(h.calls).toEqual([])
  })

  it('a second fix of the same bug while one runs is busy', async () => {
    const h = rig({ hold: true })

    const first = h.fixer.fix('MDP-9')
    const second = await h.fixer.fix('MDP-9')
    h.gate.resolve(undefined)

    expect(second).toEqual({ ok: false, error: { code: 'busy' } })
    expect(await first).toEqual({ ok: true })
    expect(h.calls.filter((call) => call.startsWith('prompt'))).toHaveLength(1)
  })
})
