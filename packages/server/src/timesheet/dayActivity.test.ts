import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claudeProjectDirName } from '@workday/core'
import { describe, expect, it } from 'vitest'
import type { GitResult } from '../workspace/git.js'
import { worktreePathOf } from '../workspace/ticketWorktrees.js'
import { readDayActivity } from './dayActivity.js'

function result(stdout: string): GitResult {
  return { ok: true, stdout, stderr: '', exitCode: 0, timedOut: false }
}

describe('readDayActivity', () => {
  it('counts the own commits and Claude work of each ticket on the day', async () => {
    const base = mkdtempSync(join(tmpdir(), 'workday-day-'))
    const dev = join(base, 'Backend')
    mkdirSync(join(dev, '.git'), { recursive: true })
    const worktree = worktreePathOf(dev, 'MDP-2')
    mkdirSync(worktree, { recursive: true })
    const projectsRoot = join(base, 'projects')
    const sessions = join(projectsRoot, claudeProjectDirName(worktree))
    mkdirSync(sessions, { recursive: true })
    // 03:00 and 03:02 UTC share one five-minute slot; 2026-11-17 in Ho Chi Minh starts at 17:00 UTC the day before.
    writeFileSync(
      join(sessions, 's1.jsonl'),
      [
        '{"timestamp":"2026-11-17T03:00:00.000Z"}',
        '{"timestamp":"2026-11-17T03:02:00.000Z"}',
        '{"timestamp":"2026-11-10T03:00:00.000Z"}',
      ].join('\n'),
    )
    const commitAt = Date.parse('2026-11-17T04:00:00Z') / 1000
    const run = (_cwd: string, args: readonly string[]): Promise<GitResult> =>
      Promise.resolve(
        args[0] === 'config'
          ? result('me@example.com\n')
          : result(`h1\tMDP-1\t${String(commitAt)}\nh1\torigin/MDP-1\t${String(commitAt)}\n`),
      )

    const activity = await readDayActivity(
      {
        devRepoPath: dev,
        siblingRepoGlob: null,
        projectsRoot,
        projectKey: 'MDP',
        timeZone: 'Asia/Ho_Chi_Minh',
        date: '2026-11-17',
        keys: ['MDP-1', 'MDP-2', 'MDP-3'],
      },
      run,
    )

    expect(activity['MDP-1']).toMatchObject({ commits: 1, claudeLast: null, activeMinutes: 5 })
    expect(activity['MDP-2']).toMatchObject({
      commits: 0,
      claudeLast: '2026-11-17T03:02:00.000Z',
      activeMinutes: 5,
    })
    expect(activity['MDP-3']).toMatchObject({ commits: 0, claudeLast: null, activeMinutes: 0 })
  })
})
